import { NextResponse } from 'next/server';
import sharp from 'sharp';
import { requireUser } from '@/lib/household';
import {
  createSupabaseServerClient,
  createSupabaseServiceRoleClient,
} from '@/lib/supabase/server';
import { AVATAR_BUCKET, buildAvatarPath } from '@/lib/storage';

export const runtime = 'nodejs';

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB pre-resize

export async function POST(request: Request) {
  const user = await requireUser();
  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'file required' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: 'Image is too large (5 MB max).' },
      { status: 413 }
    );
  }
  if (!file.type.startsWith('image/')) {
    return NextResponse.json({ error: 'File must be an image.' }, { status: 400 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const jpg = await sharp(buf)
    .rotate()
    .resize({ width: 512, height: 512, fit: 'cover' })
    .jpeg({ quality: 85 })
    .toBuffer();

  const admin = createSupabaseServiceRoleClient();
  const path = buildAvatarPath(user.id);

  const { error: upErr } = await admin.storage
    .from(AVATAR_BUCKET)
    .upload(path, jpg, { contentType: 'image/jpeg', upsert: false });
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  const { data: pub } = admin.storage.from(AVATAR_BUCKET).getPublicUrl(path);
  // Append a cache-buster so browsers pick up the new image immediately.
  const avatar_url = `${pub.publicUrl}?v=${Date.now()}`;

  const supabase = await createSupabaseServerClient();
  const { data: profile, error: pErr } = await supabase
    .from('profiles')
    .update({ avatar_url })
    .eq('id', user.id)
    .select('id, display_name, avatar_url')
    .single();

  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });
  return NextResponse.json({ profile });
}

export async function DELETE() {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const { data: profile, error } = await supabase
    .from('profiles')
    .update({ avatar_url: null })
    .eq('id', user.id)
    .select('id, display_name, avatar_url')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ profile });
}
