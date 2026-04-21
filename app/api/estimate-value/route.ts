import { NextResponse } from 'next/server';
import type Anthropic from '@anthropic-ai/sdk';
import { requireHousehold } from '@/lib/household';
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { ATTACHMENT_BUCKET } from '@/lib/storage';
import {
  anthropic,
  imageBlockFromUrlOrData,
  parseJsonResponse,
  VISION_MODEL,
} from '@/lib/ai';
import { CATEGORY_TABLE_BY_SLUG, type CategorySlug } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

interface EstimateResponse {
  value: number;
  reasoning: string;
  confidence: number;
}

// Hard caps to keep AI cost predictable. The route is user-initiated so these
// are deliberately on the generous side, but every additional source has both
// a count cap and (for binary content) a per-item byte cap.
const MAX_EXTRA_PHOTOS = 4;            // beyond the primary photo
const MAX_HISTORY_ROWS = 8;            // most-recent value_history entries
const MAX_DOC_ATTACHMENTS = 2;         // 1 appraisal + 1 receipt by default
const MAX_DOC_BYTES = 5 * 1024 * 1024; // skip any single doc larger than 5MB

type SupportedImageMime = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
type DocMime = SupportedImageMime | 'application/pdf';

function inferDocMime(filename: string | null | undefined): DocMime | null {
  const f = (filename ?? '').toLowerCase();
  if (f.endsWith('.pdf')) return 'application/pdf';
  if (f.endsWith('.png')) return 'image/png';
  if (f.endsWith('.webp')) return 'image/webp';
  if (f.endsWith('.gif')) return 'image/gif';
  if (f.endsWith('.jpg') || f.endsWith('.jpeg')) return 'image/jpeg';
  return null;
}

interface AttachmentRow {
  id: string;
  kind: 'receipt' | 'appraisal' | 'manual' | 'other';
  url: string;
  filename: string | null;
  size_bytes: number | null;
  uploaded_at: string;
}

interface ValueHistoryRow {
  value: number;
  source: 'manual' | 'ai' | 'appraisal' | 'receipt';
  dated_on: string;
  notes: string | null;
}

interface PhotoRow {
  url: string;
  thumb_url: string | null;
  is_primary: boolean;
  sort_order: number;
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

  // Per-category typed attributes (e.g. wine vintage / bottle size).
  let attributes: Record<string, unknown> | null = null;
  const attrTable = CATEGORY_TABLE_BY_SLUG[item.category as CategorySlug];
  if (attrTable) {
    const { data: attr } = await supabase.from(attrTable).select('*').eq('item_id', item_id).maybeSingle();
    attributes = attr ?? null;
  }

  // Resolve location / collection names with explicit small queries — keeps
  // us out of any PostgREST FK-disambiguation surprises (items has multiple
  // optional FKs and the schema cache occasionally guesses wrong).
  let locationName: string | null = null;
  if (item.location_id) {
    const { data: loc } = await supabase.from('locations').select('name').eq('id', item.location_id).maybeSingle();
    locationName = loc?.name ?? null;
  }
  let collectionName: string | null = null;
  if (item.collection_id) {
    const { data: col } = await supabase.from('collections').select('name').eq('id', item.collection_id).maybeSingle();
    collectionName = col?.name ?? null;
  }

  // Tags via the item_tags junction.
  const { data: tagJoin } = await supabase
    .from('item_tags')
    .select('tags ( name )')
    .eq('item_id', item_id);
  const tagNames: string[] = (() => {
    const raw = (tagJoin ?? []) as Array<{ tags?: { name?: string | null } | null }>;
    const names = raw
      .map((r) => r?.tags?.name ?? null)
      .filter((n): n is string => typeof n === 'string' && n.trim().length > 0);
    return Array.from(new Set(names));
  })();

  // Recent value history — prioritise appraisal & receipt evidence first,
  // then fill remaining slots with the latest other entries (ai / manual).
  const { data: historyRaw } = await supabase
    .from('value_history')
    .select('value, source, dated_on, notes')
    .eq('item_id', item_id)
    .order('dated_on', { ascending: false })
    .limit(40);
  const history: ValueHistoryRow[] = (() => {
    const all = (historyRaw ?? []) as ValueHistoryRow[];
    const evidence = all.filter((h) => h.source === 'appraisal' || h.source === 'receipt');
    const rest = all.filter((h) => h.source !== 'appraisal' && h.source !== 'receipt');
    return [...evidence, ...rest].slice(0, MAX_HISTORY_ROWS);
  })();

  // Up to N additional item photos — exclude the primary (it's already
  // attached separately below) and prefer non-thumbnail ordering.
  const { data: photoRows } = await supabase
    .from('item_photos')
    .select('url, thumb_url, is_primary, sort_order')
    .eq('item_id', item_id)
    .order('is_primary', { ascending: false })
    .order('sort_order', { ascending: true })
    .limit(MAX_EXTRA_PHOTOS + 1);
  const extraPhotos: PhotoRow[] = ((photoRows ?? []) as PhotoRow[])
    .filter((p) => p.url && p.url !== item.primary_photo_url)
    .slice(0, MAX_EXTRA_PHOTOS);

  // Receipt + appraisal attachments. Appraisals weighted first; receipts
  // second. We embed the actual document bytes so the AI can read line
  // items, dates, appraiser name, methodology, etc.
  const { data: attachmentRows } = await supabase
    .from('item_attachments')
    .select('id, kind, url, filename, size_bytes, uploaded_at')
    .eq('item_id', item_id)
    .in('kind', ['appraisal', 'receipt'])
    .order('uploaded_at', { ascending: false })
    .limit(8);

  const docCandidates: AttachmentRow[] = (() => {
    const all = (attachmentRows ?? []) as AttachmentRow[];
    const appraisals = all.filter((a) => a.kind === 'appraisal');
    const receipts = all.filter((a) => a.kind === 'receipt');
    // Prefer the newest appraisal then the newest receipt, then fill.
    const ordered: AttachmentRow[] = [];
    if (appraisals[0]) ordered.push(appraisals[0]);
    if (receipts[0]) ordered.push(receipts[0]);
    for (const a of all) {
      if (ordered.length >= MAX_DOC_ATTACHMENTS) break;
      if (!ordered.includes(a)) ordered.push(a);
    }
    return ordered.slice(0, MAX_DOC_ATTACHMENTS);
  })();

  // Download the chosen documents from private storage and turn them into
  // base64 content blocks. Anything we can't read or that's too large is
  // silently skipped — we still note in the prompt that it exists.
  const supa = createSupabaseServiceRoleClient();
  const docBlocks: Anthropic.Messages.ContentBlockParam[] = [];
  const docNotes: Array<{ kind: string; filename: string | null; included: boolean; reason?: string }> = [];
  for (const att of docCandidates) {
    const mime = inferDocMime(att.filename);
    if (!mime) {
      docNotes.push({ kind: att.kind, filename: att.filename, included: false, reason: 'unsupported file type' });
      continue;
    }
    if (att.size_bytes != null && att.size_bytes > MAX_DOC_BYTES) {
      docNotes.push({ kind: att.kind, filename: att.filename, included: false, reason: 'file too large' });
      continue;
    }
    try {
      const dl = await supa.storage.from(ATTACHMENT_BUCKET).download(att.url);
      if (dl.error || !dl.data) {
        docNotes.push({ kind: att.kind, filename: att.filename, included: false, reason: 'download failed' });
        continue;
      }
      const buf = Buffer.from(await dl.data.arrayBuffer());
      if (buf.byteLength > MAX_DOC_BYTES) {
        docNotes.push({ kind: att.kind, filename: att.filename, included: false, reason: 'file too large' });
        continue;
      }
      const base64 = buf.toString('base64');
      const block: Anthropic.Messages.ContentBlockParam =
        mime === 'application/pdf'
          ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }
          : { type: 'image', source: { type: 'base64', media_type: mime, data: base64 } };
      docBlocks.push(block);
      docNotes.push({ kind: att.kind, filename: att.filename, included: true });
    } catch {
      docNotes.push({ kind: att.kind, filename: att.filename, included: false, reason: 'read error' });
    }
  }

  // ---- Build the structured summary the prompt will reference. ----
  const summary = JSON.stringify(
    {
      name: item.name,
      description: item.description,
      manufacturer: item.manufacturer,
      model: item.model,
      serial_number: item.serial_number,
      category: item.category,
      condition: item.condition,
      acquired_date: item.acquired_date,
      acquired_from: item.acquired_from,
      acquired_price: item.acquired_price,
      location: locationName,
      collection: collectionName,
      tags: tagNames,
      notes: item.notes ?? null,
      custom_attributes: item.custom_attributes ?? null,
      typed_attributes: attributes,
      prior_values: history.map((h) => ({
        date: h.dated_on,
        amount: h.value,
        source: h.source,
        note: h.notes,
      })),
      attached_documents: docNotes,
    },
    null,
    2
  );

  const prompt = `You are an appraiser. Estimate this item's current fair-market replacement value in USD for an insurance schedule.

ITEM (structured details):
${summary}

You will also see, attached to this message:
- The item's primary photo (if available).
- Up to ${MAX_EXTRA_PHOTOS} additional close-up photos (serial tags, hallmarks, condition).
- Up to ${MAX_DOC_ATTACHMENTS} document(s) — typically a recent appraisal and/or purchase receipt.

How to weigh evidence (most authoritative first):
1. A recent professional APPRAISAL document. Treat the appraised amount as anchor; only deviate if conditions have clearly changed.
2. PRIOR VALUE HISTORY entries with source "appraisal" or "receipt".
3. PURCHASE RECEIPT — useful for original cost, vendor, and date; depreciate or appreciate from there as appropriate for the category and time elapsed.
4. The user's "notes" and "custom_attributes" — they often contain provenance, edition numbers, restoration history, or rarity facts the photo cannot show.
5. The photos and the rest of the structured data.

Be conservative. If the prior history already contains a credible appraisal/receipt amount and nothing material has changed, your estimate should be close to it; explain why in the reasoning. If you cannot estimate confidently, return your best guess but a low confidence.

Return ONLY JSON: {"value": <number>, "reasoning": "<2-4 sentences citing which sources you used>", "confidence": <0-1>}`;

  // ---- Build the full content array (images first, then docs, then text). ----
  const content: Anthropic.Messages.ContentBlockParam[] = [];
  if (item.primary_photo_url) {
    try {
      content.push(imageBlockFromUrlOrData({ image_url: item.primary_photo_url }) as Anthropic.Messages.ContentBlockParam);
    } catch {
      // ignore image errors; text still works
    }
  }
  for (const p of extraPhotos) {
    try {
      content.push(imageBlockFromUrlOrData({ image_url: p.url }) as Anthropic.Messages.ContentBlockParam);
    } catch {
      // ignore individual image errors
    }
  }
  for (const block of docBlocks) {
    content.push(block);
  }
  content.push({ type: 'text', text: prompt });

  try {
    const response = await anthropic.messages.create({
      model: VISION_MODEL,
      max_tokens: 800,
      messages: [{ role: 'user', content }],
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

    return NextResponse.json({
      value,
      reasoning: parsed.reasoning,
      confidence: parsed.confidence,
      sources: {
        primary_photo: Boolean(item.primary_photo_url),
        extra_photos: extraPhotos.length,
        history_rows: history.length,
        documents: docNotes,
      },
    });
  } catch (err) {
    console.error('estimate-value error', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'AI error' }, { status: 500 });
  }
}
