import sharp from 'sharp';
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from '@/lib/supabase/server';

export const PHOTO_BUCKET = 'item-photos';
export const ATTACHMENT_BUCKET = 'item-attachments';
export const REPORTS_BUCKET = 'reports';
export const AVATAR_BUCKET = 'avatars';

export function buildAvatarPath(userId: string) {
  const ts = Date.now();
  return `${userId}/${ts}.jpg`;
}

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

export interface UploadedPhoto {
  url: string;
  thumb_url: string;
  path: string;
  thumb_path: string;
}

/**
 * Resize a photo (auto-orient via EXIF), upload both the full-size JPEG
 * (max 2000px) and a 400x400 cover thumbnail to the item-photos bucket,
 * and return their public URLs. Used by both the standalone photo
 * upload endpoint and the per-item additional-photos endpoint.
 */
export async function uploadItemPhoto(opts: {
  householdId: string;
  buffer: Buffer;
  filename: string;
}): Promise<UploadedPhoto> {
  const supa = createSupabaseServiceRoleClient();
  const baseName = opts.filename || 'photo.jpg';
  const fullPath = buildPhotoPath(opts.householdId, baseName.replace(/\.[^.]+$/, '.jpg'));
  const thumbPath = fullPath.replace(/\.jpg$/, '.thumb.jpg');

  const fullJpg = await sharp(opts.buffer)
    .rotate()
    .resize({ width: 2000, withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer();

  const thumbJpg = await sharp(opts.buffer)
    .rotate()
    .resize({ width: 400, height: 400, fit: 'cover' })
    .jpeg({ quality: 75 })
    .toBuffer();

  const up1 = await supa.storage.from(PHOTO_BUCKET).upload(fullPath, fullJpg, {
    contentType: 'image/jpeg',
    upsert: false,
  });
  if (up1.error) throw up1.error;

  const up2 = await supa.storage.from(PHOTO_BUCKET).upload(thumbPath, thumbJpg, {
    contentType: 'image/jpeg',
    upsert: false,
  });
  if (up2.error) throw up2.error;

  const { data: full } = supa.storage.from(PHOTO_BUCKET).getPublicUrl(fullPath);
  const { data: thumb } = supa.storage.from(PHOTO_BUCKET).getPublicUrl(thumbPath);

  return {
    url: full.publicUrl,
    thumb_url: thumb.publicUrl,
    path: fullPath,
    thumb_path: thumbPath,
  };
}
