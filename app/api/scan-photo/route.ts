import { NextResponse } from 'next/server';
import { requireHousehold } from '@/lib/household';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { anthropic, parseJsonResponse, VISION_MODEL } from '@/lib/ai';
import { normalizeDocument, type DocumentExtraction } from '@/lib/ai-document';

export const runtime = 'nodejs';
export const maxDuration = 60;

interface PhotoCtx {
  name: string | null;
  manufacturer: string | null;
  model: string | null;
  category: string | null;
}

function buildPrompt(ctx: PhotoCtx): string {
  const ctxLine = [
    ctx.name && `name: "${ctx.name}"`,
    ctx.manufacturer && `manufacturer: "${ctx.manufacturer}"`,
    ctx.model && `model: "${ctx.model}"`,
    ctx.category && `category: "${ctx.category}"`,
  ]
    .filter(Boolean)
    .join(', ');

  return `You are inspecting a close-up photo from a household-inventory app. The user shoots tags, spec plates, and labels to record details that are too small to read in the main item photo.

Extract any visible identifiers and return ONLY a JSON object with this shape. Use null (not "" and not "unknown") for anything you cannot read with confidence. Be conservative - if a character is ambiguous, prefer null over a guess.

{
  "manufacturer": string or null,
  "model": string or null,
  "serial_number": string or null,
  "warranty_until": "YYYY-MM-DD or null",
  "notes": "1 short sentence with anything else of value (e.g. 'Mfr date 2018-04, FCC ID ...'), else null",
  "confidence": 0.0-1.0
}

${ctxLine ? `Context for the parent item: ${ctxLine}.` : ''}

Important:
- Do not invent characters in serial numbers. If part is occluded or blurry, return null.
- Differentiate model number vs serial number (model is shorter and shared across units; serial is unique per unit and often longer).
- "warranty_until" should only be set if a clear expiry date is printed.`;
}

async function runScan(photoUrl: string, ctx: PhotoCtx): Promise<DocumentExtraction> {
  const response = await anthropic.messages.create({
    model: VISION_MODEL,
    max_tokens: 600,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'url', url: photoUrl } },
          { type: 'text', text: buildPrompt(ctx) },
        ],
      },
    ],
  });
  const textBlock = response.content.find((b) => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('No text response from AI');
  }
  const raw = parseJsonResponse<Record<string, unknown>>(textBlock.text);
  // Reuse the document normalizer so the response shape matches what
  // DocumentApplyDialog expects. Receipt/appraisal-only fields stay null.
  return normalizeDocument(raw);
}

/**
 * POST /api/scan-photo
 *
 * Two call shapes:
 *
 * 1. { photo_id }       - reads an item_photos row and pulls item context
 *                         from the parent item. Used by the detail page
 *                         "Scan" button on existing photos.
 *
 * 2. { photo_url, context? } - scan an arbitrary photo URL (must be on a
 *                         host the model can fetch from). Used by the
 *                         new-item QuickConfirm flow where extra photos
 *                         have been uploaded but no item exists yet.
 *
 * Returns a DocumentExtraction so the existing DocumentApplyDialog
 * can render the confirmation UI.
 */
export async function POST(request: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 });
  }
  const household = await requireHousehold();
  const body = (await request.json().catch(() => null)) as {
    photo_id?: string;
    photo_url?: string;
    context?: Partial<PhotoCtx>;
  } | null;

  // ---- URL mode (new-item flow) ----
  if (body?.photo_url) {
    const ctx: PhotoCtx = {
      name: body.context?.name ?? null,
      manufacturer: body.context?.manufacturer ?? null,
      model: body.context?.model ?? null,
      category: body.context?.category ?? null,
    };
    try {
      const extraction = await runScan(body.photo_url, ctx);
      return NextResponse.json({ photo_url: body.photo_url, extraction });
    } catch (err) {
      console.error('scan-photo error (url)', err);
      return NextResponse.json(
        { error: err instanceof Error ? err.message : 'AI scan failed' },
        { status: 500 }
      );
    }
  }

  // ---- ID mode (existing-item flow) ----
  if (!body?.photo_id) {
    return NextResponse.json({ error: 'photo_id or photo_url required' }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const { data: photo } = await supabase
    .from('item_photos')
    .select('id, url, item_id, items!inner(id, household_id, name, manufacturer, model, category)')
    .eq('id', body.photo_id)
    .single();
  if (!photo) return NextResponse.json({ error: 'photo not found' }, { status: 404 });

  const item = (photo as unknown as {
    items: {
      id: string;
      household_id: string;
      name: string | null;
      manufacturer: string | null;
      model: string | null;
      category: string | null;
    };
  }).items;
  if (item.household_id !== household.id) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  try {
    const extraction = await runScan(photo.url, {
      name: item.name,
      manufacturer: item.manufacturer,
      model: item.model,
      category: item.category,
    });
    return NextResponse.json({
      photo_id: photo.id,
      item_id: item.id,
      extraction,
    });
  } catch (err) {
    console.error('scan-photo error (id)', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'AI scan failed' },
      { status: 500 }
    );
  }
}
