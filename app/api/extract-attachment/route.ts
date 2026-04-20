import { NextResponse } from 'next/server';
import type Anthropic from '@anthropic-ai/sdk';
import { requireHousehold } from '@/lib/household';
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { ATTACHMENT_BUCKET } from '@/lib/storage';
import { anthropic, parseJsonResponse, VISION_MODEL } from '@/lib/ai';
import {
  buildDocumentPrompt,
  normalizeDocument,
  type DocumentExtraction,
  type DocumentItemContext,
} from '@/lib/ai-document';
import type { AttachmentKind } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

const ALLOWED_KINDS: AttachmentKind[] = ['receipt', 'appraisal', 'manual', 'other'];

type SupportedImageMime = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
type ExtractMime = SupportedImageMime | 'application/pdf';

const MAX_BYTES = 32 * 1024 * 1024; // Anthropic doc input cap

function inferMime(filename: string | null | undefined, fallback?: string): ExtractMime | null {
  const f = (filename ?? '').toLowerCase();
  const t = (fallback ?? '').toLowerCase();
  if (f.endsWith('.pdf') || t === 'application/pdf') return 'application/pdf';
  if (f.endsWith('.png') || t === 'image/png') return 'image/png';
  if (f.endsWith('.webp') || t === 'image/webp') return 'image/webp';
  if (f.endsWith('.gif') || t === 'image/gif') return 'image/gif';
  if (f.endsWith('.jpg') || f.endsWith('.jpeg') || t === 'image/jpeg' || t === 'image/jpg') return 'image/jpeg';
  return null;
}

function asKind(raw: unknown): AttachmentKind {
  if (typeof raw === 'string' && ALLOWED_KINDS.includes(raw as AttachmentKind)) {
    return raw as AttachmentKind;
  }
  return 'other';
}

async function runExtraction(
  buf: Buffer,
  mime: ExtractMime,
  kind: AttachmentKind,
  ctx: DocumentItemContext
): Promise<DocumentExtraction> {
  const base64 = buf.toString('base64');
  const contentBlock: Anthropic.Messages.ContentBlockParam =
    mime === 'application/pdf'
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }
      : { type: 'image', source: { type: 'base64', media_type: mime, data: base64 } };

  const prompt = buildDocumentPrompt(kind, ctx);
  const response = await anthropic.messages.create({
    model: VISION_MODEL,
    max_tokens: 1500,
    messages: [{ role: 'user', content: [contentBlock, { type: 'text', text: prompt }] }],
  });
  const textBlock = response.content.find((b) => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('No text response from AI');
  }
  const raw = parseJsonResponse<Record<string, unknown>>(textBlock.text);
  return normalizeDocument(raw);
}

/**
 * POST /api/extract-attachment
 *
 * Two call shapes:
 *
 * 1. JSON  { attachment_id, kind? }  → extract from an already-uploaded
 *    attachment in storage. Used by the AttachmentsPanel on the item
 *    detail page. Item context (name/manufacturer/model/category) is
 *    pulled from the parent item row.
 *
 * 2. Multipart  file=<File>, kind=<receipt|appraisal|manual|other>,
 *    context=<json>  → extract from raw bytes that haven't been
 *    persisted yet. Used by the new-item flow so the user can attach
 *    documents BEFORE the item row exists. The context blob (optional)
 *    carries any prefill the user has already accumulated so the prompt
 *    can target the right line item / appraisal entry.
 */
export async function POST(request: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 });
  }
  const household = await requireHousehold();
  const contentType = request.headers.get('content-type') ?? '';

  // ---------- Multipart: direct file upload, no item yet ----------
  if (contentType.includes('multipart/form-data')) {
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'file required' }, { status: 400 });
    }
    const kind = asKind(form.get('kind'));
    const ctxRaw = form.get('context');
    let ctx: DocumentItemContext = {};
    if (typeof ctxRaw === 'string' && ctxRaw.trim()) {
      try {
        ctx = JSON.parse(ctxRaw) as DocumentItemContext;
      } catch {
        // Ignore bad context; extraction still works without it.
      }
    }

    const mime = inferMime(file.name, file.type);
    if (!mime) {
      return NextResponse.json(
        { error: 'Unsupported file type. Documents must be JPG, PNG, WEBP, GIF, or PDF.' },
        { status: 415 }
      );
    }
    const buf = Buffer.from(await file.arrayBuffer());
    if (buf.byteLength > MAX_BYTES) {
      return NextResponse.json({ error: 'Document is too large to extract (32MB max).' }, { status: 413 });
    }

    try {
      const extraction = await runExtraction(buf, mime, kind, ctx);
      return NextResponse.json({ kind, extraction });
    } catch (err) {
      console.error('extract-attachment error (blob)', err);
      return NextResponse.json(
        { error: err instanceof Error ? err.message : 'AI extraction failed' },
        { status: 500 }
      );
    }
  }

  // ---------- JSON: extract from an existing stored attachment ----------
  const body = (await request.json().catch(() => null)) as {
    attachment_id?: string;
    kind?: AttachmentKind;
  } | null;
  if (!body?.attachment_id) {
    return NextResponse.json({ error: 'attachment_id required' }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const { data: att, error: attErr } = await supabase
    .from('item_attachments')
    .select('id, url, kind, filename, item_id, items!inner(id, household_id, name, manufacturer, model, category)')
    .eq('id', body.attachment_id)
    .single();
  if (attErr || !att) return NextResponse.json({ error: 'attachment not found' }, { status: 404 });

  const item = (att as unknown as {
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

  const kind = asKind(body.kind ?? att.kind);
  const mime = inferMime(att.filename ?? null);
  if (!mime) {
    return NextResponse.json(
      { error: 'Unsupported file type. Must be JPG, PNG, WEBP, GIF, or PDF.' },
      { status: 415 }
    );
  }

  const supa = createSupabaseServiceRoleClient();
  const dl = await supa.storage.from(ATTACHMENT_BUCKET).download(att.url);
  if (dl.error || !dl.data) {
    return NextResponse.json({ error: dl.error?.message ?? 'Could not read attachment' }, { status: 500 });
  }
  const buf = Buffer.from(await dl.data.arrayBuffer());
  if (buf.byteLength > MAX_BYTES) {
    return NextResponse.json({ error: 'Document is too large to extract (32MB max).' }, { status: 413 });
  }

  try {
    const extraction = await runExtraction(buf, mime, kind, {
      name: item.name,
      manufacturer: item.manufacturer,
      model: item.model,
      category: item.category,
    });
    return NextResponse.json({
      attachment_id: att.id,
      item_id: item.id,
      kind,
      extraction,
    });
  } catch (err) {
    console.error('extract-attachment error (stored)', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'AI extraction failed' },
      { status: 500 }
    );
  }
}
