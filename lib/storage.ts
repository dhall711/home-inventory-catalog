import { createSupabaseServerClient, createSupabaseServiceRoleClient } from '@/lib/supabase/server';

export const PHOTO_BUCKET = 'item-photos';
export const ATTACHMENT_BUCKET = 'item-attachments';
export const REPORTS_BUCKET = 'reports';

export function buildPhotoPath(householdId: string, fileName: string) {
  const ts = Date.now();
  const safe = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  return `${householdId}/${ts}-${safe}`;
}

export function buildAttachmentPath(householdId: string, itemId: string, fileName: string) {
  const ts = Date.now();
  const safe = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  return `${householdId}/${itemId}/${ts}-${safe}`;
}

export function buildReportPath(householdId: string, name: string, ext: string) {
  const ts = Date.now();
  const safe = name.replace(/[^a-zA-Z0-9._-]/g, '_');
  return `${householdId}/${ts}-${safe}.${ext}`;
}

export async function publicPhotoUrl(path: string) {
  const supabase = await createSupabaseServerClient();
  const { data } = supabase.storage.from(PHOTO_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

export async function signedAttachmentUrl(path: string, expiresIn = 3600) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.storage.from(ATTACHMENT_BUCKET).createSignedUrl(path, expiresIn);
  return data?.signedUrl ?? null;
}

export async function uploadServerFile(opts: {
  bucket: string;
  path: string;
  data: Buffer | Uint8Array | Blob;
  contentType: string;
  upsert?: boolean;
}) {
  const supabase = createSupabaseServiceRoleClient();
  const { error } = await supabase.storage.from(opts.bucket).upload(opts.path, opts.data, {
    contentType: opts.contentType,
    upsert: opts.upsert ?? false,
  });
  if (error) throw error;
  return supabase.storage.from(opts.bucket).getPublicUrl(opts.path).data.publicUrl;
}
