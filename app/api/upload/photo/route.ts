import { NextResponse } from 'next/server';
import sharp from 'sharp';
import { requireHousehold } from '@/lib/household';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { PHOTO_BUCKET, buildPhotoPath } from '@/lib/storage';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const household = await requireHousehold();
  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'file required' }, { status: 400 });
  }
  const buf = Buffer.from(await file.arrayBuffer());
  const supa = createSupabaseServiceRoleClient();

  const baseName = file.name || 'photo.jpg';
  const fullPath = buildPhotoPath(household.id, baseName.replace(/\.[^.]+$/, '.jpg'));
  const thumbPath = fullPath.replace(/\.jpg$/, '.thumb.jpg');

  const fullJpg = await sharp(buf)
    .rotate()
    .resize({ width: 2000, withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer();

  const thumbJpg = await sharp(buf)
    .rotate()
    .resize({ width: 400, height: 400, fit: 'cover' })
    .jpeg({ quality: 75 })
    .toBuffer();

  const up1 = await supa.storage.from(PHOTO_BUCKET).upload(fullPath, fullJpg, {
    contentType: 'image/jpeg',
    upsert: false,
  });
  if (up1.error) return NextResponse.json({ error: up1.error.message }, { status: 500 });

  const up2 = await supa.storage.from(PHOTO_BUCKET).upload(thumbPath, thumbJpg, {
    contentType: 'image/jpeg',
    upsert: false,
  });
  if (up2.error) return NextResponse.json({ error: up2.error.message }, { status: 500 });

  const { data: full } = supa.storage.from(PHOTO_BUCKET).getPublicUrl(fullPath);
  const { data: thumb } = supa.storage.from(PHOTO_BUCKET).getPublicUrl(thumbPath);

  return NextResponse.json({
    url: full.publicUrl,
    thumb_url: thumb.publicUrl,
    path: fullPath,
    thumb_path: thumbPath,
  });
}
