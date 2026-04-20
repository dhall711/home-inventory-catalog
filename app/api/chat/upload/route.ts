import { NextResponse } from 'next/server';
import sharp from 'sharp';
import { requireHousehold } from '@/lib/household';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

const CHAT_BUCKET = 'chat-images';

/**
 * Upload a single image to the private chat-images bucket. Returns a
 * signed URL good for one hour the chat UI can use to display the image,
 * AND that the agent can pass into analyze_photo.
 *
 * Path convention: <household_id>/<timestamp>-<rand>.jpg
 *   - matches the storage RLS policy that enforces household isolation
 */
export async function POST(request: Request) {
  const household = await requireHousehold();
  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'file required' }, { status: 400 });
  }
  if (file.size > 15 * 1024 * 1024) {
    return NextResponse.json({ error: 'image too large (15MB max)' }, { status: 400 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  // Re-encode to JPEG and cap at 1600px to keep storage + token cost down.
  // Vision quality at 1600px is typically equivalent to the original for
  // appraisal-style use-cases.
  const jpg = await sharp(buf)
    .rotate()
    .resize({ width: 1600, withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer();

  const fname = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
  const path = `${household.id}/${fname}`;
  const supa = createSupabaseServiceRoleClient();

  const up = await supa.storage.from(CHAT_BUCKET).upload(path, jpg, {
    contentType: 'image/jpeg',
    upsert: false,
  });
  if (up.error) return NextResponse.json({ error: up.error.message }, { status: 500 });

  // 1-hour signed URL is plenty - the agent only needs it for the next
  // few API calls in this turn, after which the URL is just for display.
  const { data: signed, error: signErr } = await supa.storage
    .from(CHAT_BUCKET)
    .createSignedUrl(path, 60 * 60);
  if (signErr || !signed) {
    return NextResponse.json({ error: signErr?.message ?? 'sign failed' }, { status: 500 });
  }

  return NextResponse.json({ url: signed.signedUrl, path });
}
