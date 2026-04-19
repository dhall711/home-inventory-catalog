import { NextResponse } from 'next/server';
import { requireHousehold, requireUser } from '@/lib/household';
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { ATTACHMENT_BUCKET, buildAttachmentPath } from '@/lib/storage';
import type { AttachmentKind } from '@/lib/types';

export const runtime = 'nodejs';

const ALLOWED_KINDS: AttachmentKind[] = ['receipt', 'appraisal', 'manual', 'other'];

export async function POST(request: Request) {
  const household = await requireHousehold();
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const form = await request.formData();
  const file = form.get('file');
  const itemId = form.get('item_id') as string | null;
  const kindRaw = form.get('kind') as string | null;
  if (!(file instanceof File) || !itemId || !kindRaw) {
    return NextResponse.json({ error: 'file, item_id, kind required' }, { status: 400 });
  }
  const kind = ALLOWED_KINDS.includes(kindRaw as AttachmentKind) ? (kindRaw as AttachmentKind) : 'other';

  // Verify item belongs to household
  const { data: item } = await supabase
    .from('items')
    .select('id')
    .eq('id', itemId)
    .eq('household_id', household.id)
    .single();
  if (!item) return NextResponse.json({ error: 'item not found' }, { status: 404 });

  const path = buildAttachmentPath(household.id, itemId, file.name || 'file');
  const buf = Buffer.from(await file.arrayBuffer());
  const supa = createSupabaseServiceRoleClient();
  const { error: upErr } = await supa.storage.from(ATTACHMENT_BUCKET).upload(path, buf, {
    contentType: file.type || 'application/octet-stream',
    upsert: false,
  });
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  const { data: row, error: insErr } = await supabase
    .from('item_attachments')
    .insert({
      item_id: itemId,
      kind,
      url: path, // store path; signed URL generated on demand
      filename: file.name,
      size_bytes: file.size,
      uploaded_by: user.id,
    })
    .select('*')
    .single();
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

  return NextResponse.json({ attachment: row });
}
