import { NextResponse } from 'next/server';
import { requireHousehold } from '@/lib/household';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import {
  anthropic,
  imageBlockFromUrlOrData,
  parseJsonResponse,
  VISION_MODEL,
} from '@/lib/ai';
import { CATEGORY_TABLE_BY_SLUG, type CategorySlug } from '@/lib/types';

export const runtime = 'nodejs';

interface EstimateResponse {
  value: number;
  reasoning: string;
  confidence: number;
}

export async function POST(request: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 });
  }
  const household = await requireHousehold();
  const supabase = await createSupabaseServerClient();
  const body = await request.json();
  const { item_id } = body as { item_id: string };
  if (!item_id) return NextResponse.json({ error: 'item_id required' }, { status: 400 });

  const { data: item } = await supabase
    .from('items')
    .select('*')
    .eq('id', item_id)
    .eq('household_id', household.id)
    .single();
  if (!item) return NextResponse.json({ error: 'not found' }, { status: 404 });

  let attributes: Record<string, unknown> | null = null;
  const attrTable = CATEGORY_TABLE_BY_SLUG[item.category as CategorySlug];
  if (attrTable) {
    const { data: attr } = await supabase.from(attrTable).select('*').eq('item_id', item_id).maybeSingle();
    attributes = attr ?? null;
  }

  const summary = JSON.stringify({
    name: item.name,
    description: item.description,
    manufacturer: item.manufacturer,
    model: item.model,
    serial_number: item.serial_number,
    category: item.category,
    condition: item.condition,
    acquired_date: item.acquired_date,
    acquired_price: item.acquired_price,
    attributes,
  }, null, 2);

  const prompt = `You are an appraiser. Given the item details below (and the photo if attached), estimate its current fair-market replacement value in USD for an insurance schedule.

ITEM:
${summary}

Be conservative. If you cannot estimate confidently, return your best guess but a low confidence.

Return ONLY JSON: {"value": <number>, "reasoning": "<1-3 sentences>", "confidence": <0-1>}`;

  const content: Array<unknown> = [];
  if (item.primary_photo_url) {
    try {
      content.push(imageBlockFromUrlOrData({ image_url: item.primary_photo_url }));
    } catch {
      // ignore image errors and just use text
    }
  }
  content.push({ type: 'text', text: prompt });

  try {
    const response = await anthropic.messages.create({
      model: VISION_MODEL,
      max_tokens: 600,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      messages: [{ role: 'user', content: content as any }],
    });
    const textBlock = response.content.find((b) => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      return NextResponse.json({ error: 'No text response' }, { status: 502 });
    }
    const parsed = parseJsonResponse<EstimateResponse>(textBlock.text);
    const value = Number(parsed.value);
    if (!isFinite(value)) {
      return NextResponse.json({ error: 'Invalid value from AI' }, { status: 502 });
    }

    const now = new Date().toISOString();
    await supabase.from('value_history').insert({
      item_id,
      value,
      source: 'ai',
      dated_on: now.slice(0, 10),
      notes: parsed.reasoning,
    });
    await supabase
      .from('items')
      .update({
        current_value: value,
        current_value_source: 'ai',
        current_value_updated_at: now,
      })
      .eq('id', item_id);

    return NextResponse.json({ value, reasoning: parsed.reasoning, confidence: parsed.confidence });
  } catch (err) {
    console.error('estimate-value error', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'AI error' }, { status: 500 });
  }
}
