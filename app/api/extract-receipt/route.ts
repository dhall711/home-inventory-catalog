import { NextResponse } from 'next/server';
import type Anthropic from '@anthropic-ai/sdk';
import { requireHousehold } from '@/lib/household';
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { ATTACHMENT_BUCKET } from '@/lib/storage';
import { anthropic, parseJsonResponse, VISION_MODEL } from '@/lib/ai';
import { buildReceiptPrompt, normalizeReceipt, type ReceiptExtraction } from '@/lib/ai-receipt';

export const runtime = 'nodejs';
export const maxDuration = 60;

type SupportedImageMime = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

function inferMime(filename: string | null | undefined, fallback?: string): SupportedImageMime | 'application/pdf' | null {
  const f = (filename ?? '').toLowerCase();
  const t = (fallback ?? '').toLowerCase();
  if (f.endsWith('.pdf') || t === 'application/pdf') return 'application/pdf';
  if (f.endsWith('.png') || t === 'image/png') return 'image/png';
  if (f.endsWith('.webp') || t === 'image/webp') return 'image/webp';
  if (f.endsWith('.gif') || t === 'image/gif') return 'image/gif';
  if (f.endsWith('.jpg') || f.endsWith('.jpeg') || t === 'image/jpeg' || t === 'image/jpg') return 'image/jpeg';
  return null;
}

export async function POST(request: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 });
  }
  const household = await requireHousehold();
  const body = await request.json().catch(() => null) as { attachment_id?: string } | null;
  if (!body?.attachment_id) {
    return NextResponse.json({ error: 'attachment_id required' }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  // Pull the attachment + parent item context. RLS already restricts to the
  // user's households, but we double-check household_id below so this route
  // is safe even if RLS were ever loosened.
  const { data: att, error: attErr } = await supabase
    .from('item_attachments')
    .select('id, url, kind, filename, item_id, items!inner(id, household_id, name, manufacturer, model, category)')
    .eq('id', body.attachment_id)
    .single();
  if (attErr || !att) return NextResponse.json({ error: 'attachment not found' }, { status: 404 });

  const item = (att as unknown as { items: { id: string; household_id: string; name: string | null; manufacturer: string | null; model: string | null; category: string | null } }).items;
  if (item.household_id !== household.id) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const mime = inferMime(att.filename ?? null);
  if (!mime) {
    return NextResponse.json(
      { error: 'Unsupported file type. Receipts must be JPG, PNG, WEBP, GIF, or PDF.' },
      { status: 415 }
    );
  }

  // Download bytes via service role - the bucket is private and the model
  // can't fetch a signed URL on its own anyway. We pass base64 inline.
  const supa = createSupabaseServiceRoleClient();
  const dl = await supa.storage.from(ATTACHMENT_BUCKET).download(att.url);
  if (dl.error || !dl.data) {
    return NextResponse.json({ error: dl.error?.message ?? 'Could not read attachment' }, { status: 500 });
  }
  const buf = Buffer.from(await dl.data.arrayBuffer());
  // Anthropic limits document inputs to 32MB; bail early with a clear message.
  if (buf.byteLength > 32 * 1024 * 1024) {
    return NextResponse.json({ error: 'Receipt is too large to extract (32MB max).' }, { status: 413 });
  }
  const base64 = buf.toString('base64');

  const contentBlock: Anthropic.Messages.ContentBlockParam =
    mime === 'application/pdf'
      ? {
          type: 'document',
          source: { type: 'base64', media_type: 'application/pdf', data: base64 },
        }
      : {
          type: 'image',
          source: { type: 'base64', media_type: mime, data: base64 },
        };

  const prompt = buildReceiptPrompt({
    name: item.name,
    manufacturer: item.manufacturer,
    model: item.model,
    category: item.category,
  });

  let extraction: ReceiptExtraction;
  try {
    const response = await anthropic.messages.create({
      model: VISION_MODEL,
      max_tokens: 1500,
      messages: [{ role: 'user', content: [contentBlock, { type: 'text', text: prompt }] }],
    });
    const textBlock = response.content.find((b) => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      return NextResponse.json({ error: 'No text response from AI' }, { status: 502 });
    }
    const raw = parseJsonResponse<Record<string, unknown>>(textBlock.text);
    extraction = normalizeReceipt(raw);
  } catch (err) {
    console.error('extract-receipt error', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'AI extraction failed' },
      { status: 500 }
    );
  }

  return NextResponse.json({
    attachment_id: att.id,
    item_id: item.id,
    extraction,
  });
}
