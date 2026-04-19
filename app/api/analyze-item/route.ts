import { NextResponse } from 'next/server';
import {
  anthropic,
  buildItemSchemaPrompt,
  CATEGORY_GUIDANCE,
  imageBlockFromUrlOrData,
  knownCategorySlugs,
  parseJsonResponse,
  VISION_MODEL,
} from '@/lib/ai';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 });
  }

  const body = await request.json();
  const { image_url, image_data, hint, crop_bbox } = body as {
    image_url?: string;
    image_data?: string;
    hint?: string;
    crop_bbox?: { x: number; y: number; width: number; height: number };
  };

  let imageBlock;
  try {
    imageBlock = imageBlockFromUrlOrData({ image_url, image_data });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }

  const cropHint = crop_bbox
    ? `\nIMPORTANT: focus only on the item within the relative bounding box {x: ${crop_bbox.x}, y: ${crop_bbox.y}, w: ${crop_bbox.width}, h: ${crop_bbox.height}} (values 0-1, top-left origin).`
    : '';

  const prompt = `You are an expert appraiser cataloging a household item for an insurance inventory.

Look at the image and extract everything visible. Use your domain knowledge to infer what cannot be read directly. Be conservative on serial numbers and model numbers - only return them if clearly legible.

Categorize the item using EXACTLY one of these slugs: ${knownCategorySlugs().join(', ')}.

${CATEGORY_GUIDANCE}

Per-category attribute keys you may populate inside "attributes":
${buildItemSchemaPrompt()}

Return ONLY a JSON object, no commentary, with this shape:

{
  "category": "<one of the slugs>",
  "name": "concise human-friendly name",
  "description": "1-3 sentence description",
  "manufacturer": "brand if known",
  "model": "model name/number if visible",
  "serial_number": "only if clearly legible",
  "condition": "Excellent | Very Good | Good | Fair | Poor",
  "acquired_date": "ISO date if visible (e.g. on receipt)",
  "acquired_price": numeric or null,
  "estimated_value": numeric current replacement/market value in USD,
  "estimated_value_reasoning": "1-2 sentences justifying the estimate",
  "confidence": 0.0-1.0,
  "attributes": { /* category-specific keys from the list above, omit unknowns */ },
  "custom_attributes": { /* OPTIONAL: any other relevant key/value strings that don't fit the typed schema (e.g. "ribbon color": "blue", "auction lot": "Christie's 2014 #233"). Keys should be short, lowercase, snake_case-ish; values are short strings. */ }
}

${hint ? `Additional user hint: ${hint}\n` : ''}${cropHint}`;

  try {
    const response = await anthropic.messages.create({
      model: VISION_MODEL,
      max_tokens: 1500,
      messages: [{ role: 'user', content: [imageBlock, { type: 'text', text: prompt }] }],
    });
    const textBlock = response.content.find((b) => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      return NextResponse.json({ error: 'No text response from AI' }, { status: 502 });
    }
    const data = parseJsonResponse<Record<string, unknown>>(textBlock.text);
    return NextResponse.json({ data });
  } catch (err) {
    console.error('analyze-item error', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'AI error' }, { status: 500 });
  }
}
