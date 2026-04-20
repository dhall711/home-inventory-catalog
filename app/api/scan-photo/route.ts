import { NextResponse } from 'next/server';
import { requireHousehold } from '@/lib/household';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { anthropic, parseJsonResponse, VISION_MODEL } from '@/lib/ai';
import { normalizeReceipt, type ReceiptExtraction } from '@/lib/ai-receipt';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * POST /api/scan-photo  { photo_id }
 *
 * Reads a single item_photos row and runs Claude on it to pull text-only
 * fields (serial number, model, manufacturer, warranty date, condition).
 * Useful for close-up "spec plate" or "serial tag" photos that the user
 * uploads alongside the main hero shot.
 *
 * Returns the same ReceiptExtraction shape so the existing
 * ReceiptApplyDialog can render the confirmation UI.
 */
export async function POST(request: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 });
  }
  const household = await requireHousehold();
  const body = (await request.json().catch(() => null)) as { photo_id?: string } | null;
  if (!body?.photo_id) {
    return NextResponse.json({ error: 'photo_id required' }, { status: 400 });
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

  const ctx = [
    item.name && `name: "${item.name}"`,
    item.manufacturer && `manufacturer: "${item.manufacturer}"`,
    item.model && `model: "${item.model}"`,
    item.category && `category: "${item.category}"`,
  ]
    .filter(Boolean)
    .join(', ');

  const prompt = `You are inspecting a close-up photo from a household-inventory app. The user shoots tags, spec plates, and labels to record details that are too small to read in the main item photo.

Extract any visible identifiers and return ONLY a JSON object with this shape. Use null (not "" and not "unknown") for anything you cannot read with confidence. Be conservative - if a character is ambiguous, prefer null over a guess.

{
  "manufacturer": string or null,
  "model": string or null,
  "serial_number": string or null,
  "warranty_until": "YYYY-MM-DD or null",
  "notes": "1 short sentence with anything else of value (e.g. 'Mfr date 2018-04, FCC ID ...'), else null",
  "confidence": 0.0-1.0
}

${ctx ? `Context for the parent item: ${ctx}.` : ''}

Important:
- Do not invent characters in serial numbers. If part is occluded or blurry, return null.
- Differentiate model number vs serial number (model is shorter and shared across units; serial is unique per unit and often longer).
- "warranty_until" should only be set if a clear expiry date is printed.`;

  let extraction: ReceiptExtraction;
  try {
    const response = await anthropic.messages.create({
      model: VISION_MODEL,
      max_tokens: 600,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'url', url: photo.url } },
            { type: 'text', text: prompt },
          ],
        },
      ],
    });
    const textBlock = response.content.find((b) => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      return NextResponse.json({ error: 'No text response from AI' }, { status: 502 });
    }
    const raw = parseJsonResponse<Record<string, unknown>>(textBlock.text);
    // Reuse the receipt normalizer so the response shape matches what
    // ReceiptApplyDialog expects. Receipt-only fields stay null.
    extraction = normalizeReceipt(raw);
  } catch (err) {
    console.error('scan-photo error', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'AI scan failed' },
      { status: 500 }
    );
  }

  return NextResponse.json({
    photo_id: photo.id,
    item_id: item.id,
    extraction,
  });
}
