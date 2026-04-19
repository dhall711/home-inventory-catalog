import { NextResponse } from 'next/server';
import { requireHousehold, requireUser } from '@/lib/household';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import {
  anthropic,
  CATEGORY_GUIDANCE,
  imageBlockFromUrlOrData,
  knownCategorySlugs,
  parseJsonResponse,
  VISION_MODEL,
} from '@/lib/ai';
import type { AIDetectedItem } from '@/lib/types';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 });
  }

  const household = await requireHousehold();
  const user = await requireUser();
  const body = await request.json();
  const { image_url } = body as { image_url: string };
  if (!image_url) return NextResponse.json({ error: 'image_url required' }, { status: 400 });

  const supabase = await createSupabaseServerClient();
  const { data: batch, error: batchErr } = await supabase
    .from('batch_uploads')
    .insert({
      household_id: household.id,
      source_image_url: image_url,
      status: 'analyzing',
      created_by: user.id,
    })
    .select('id')
    .single();
  if (batchErr || !batch) {
    return NextResponse.json({ error: batchErr?.message ?? 'batch insert failed' }, { status: 500 });
  }

  const prompt = `You are cataloging a household photo (a shelf, room, drawer, or display) for an insurance inventory.

Identify every distinct item of value visible in the photo. Skip clutter, decor without value, and fixtures.

For each item, provide a relative bounding box in the format {x, y, width, height} where each value is between 0 and 1, with (0,0) at the top-left of the image.

Use EXACTLY one of these category slugs: ${knownCategorySlugs().join(', ')}.

${CATEGORY_GUIDANCE}

Return ONLY a JSON object of this shape (no commentary):

{
  "items": [
    {
      "name": "concise human-friendly name",
      "category": "<slug>",
      "description": "1 sentence description",
      "estimated_value": numeric USD or null,
      "confidence": 0.0-1.0,
      "bbox": { "x": 0.0, "y": 0.0, "width": 0.0, "height": 0.0 }
    }
  ]
}`;

  try {
    const response = await anthropic.messages.create({
      model: VISION_MODEL,
      max_tokens: 4000,
      messages: [
        {
          role: 'user',
          content: [imageBlockFromUrlOrData({ image_url }), { type: 'text', text: prompt }],
        },
      ],
    });
    const textBlock = response.content.find((b) => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      await supabase.from('batch_uploads').update({ status: 'error' }).eq('id', batch.id);
      return NextResponse.json({ error: 'No text response from AI' }, { status: 502 });
    }
    const parsed = parseJsonResponse<{ items: AIDetectedItem[] }>(textBlock.text);
    const items = parsed.items ?? [];

    // Insert one draft item per detection (status='review')
    const drafts = items.map((it) => ({
      household_id: household.id,
      category: it.category,
      name: it.name,
      description: it.description ?? null,
      current_value: it.estimated_value ?? null,
      current_value_source: it.estimated_value != null ? 'ai' : null,
      current_value_updated_at: it.estimated_value != null ? new Date().toISOString() : null,
      ai_confidence: it.confidence ?? null,
      ai_raw_json: it,
      status: 'review',
      primary_photo_url: image_url,
      created_by: user.id,
    }));

    const inserted: { id: string }[] = [];
    if (drafts.length > 0) {
      const { data: rows, error: insErr } = await supabase
        .from('items')
        .insert(drafts)
        .select('id');
      if (insErr) {
        await supabase.from('batch_uploads').update({ status: 'error' }).eq('id', batch.id);
        return NextResponse.json({ error: insErr.message }, { status: 500 });
      }
      inserted.push(...(rows ?? []));

      // Insert per-item photos linked to the batch with bounding boxes
      const photoRows = items.map((it, i) => ({
        item_id: inserted[i]!.id,
        url: image_url,
        is_primary: true,
        sort_order: 0,
        source_batch_id: batch.id,
        bbox_json: it.bbox,
      }));
      if (photoRows.length > 0) await supabase.from('item_photos').insert(photoRows);
    }

    await supabase
      .from('batch_uploads')
      .update({ status: 'review', detected_count: items.length })
      .eq('id', batch.id);

    return NextResponse.json({ batch_id: batch.id, count: items.length });
  } catch (err) {
    console.error('analyze-batch error', err);
    await supabase.from('batch_uploads').update({ status: 'error' }).eq('id', batch.id);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'AI error' }, { status: 500 });
  }
}
