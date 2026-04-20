import { NextResponse } from 'next/server';
import { requireHousehold } from '@/lib/household';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { uploadItemPhoto } from '@/lib/storage';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * GET /api/items/[id]/photos
 * Returns all photos for an item, ordered by sort_order then created_at.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const household = await requireHousehold();
  const supabase = await createSupabaseServerClient();

  const { data: item } = await supabase
    .from('items')
    .select('id')
    .eq('id', id)
    .eq('household_id', household.id)
    .single();
  if (!item) return NextResponse.json({ error: 'item not found' }, { status: 404 });

  const { data, error } = await supabase
    .from('item_photos')
    .select('*')
    .eq('item_id', id)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ photos: data ?? [] });
}

/**
 * POST /api/items/[id]/photos  (multipart/form-data, field "file")
 *
 * Upload an additional photo for an item. The first photo on an item
 * automatically becomes the primary (and seeds items.primary_photo_url);
 * subsequent uploads are appended to the gallery.
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const household = await requireHousehold();
  const supabase = await createSupabaseServerClient();

  const { data: item } = await supabase
    .from('items')
    .select('id, primary_photo_url')
    .eq('id', id)
    .eq('household_id', household.id)
    .single();
  if (!item) return NextResponse.json({ error: 'item not found' }, { status: 404 });

  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'file required' }, { status: 400 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  let uploaded;
  try {
    uploaded = await uploadItemPhoto({
      householdId: household.id,
      buffer: buf,
      filename: file.name,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Upload failed' },
      { status: 500 }
    );
  }

  // Determine sort_order = max+1 so new uploads always land at the end.
  const { data: maxRow } = await supabase
    .from('item_photos')
    .select('sort_order')
    .eq('item_id', id)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = ((maxRow?.sort_order as number | undefined) ?? -1) + 1;

  // Auto-promote the first photo on a bare item.
  const isFirst = !item.primary_photo_url;

  const { data: photoRow, error: insErr } = await supabase
    .from('item_photos')
    .insert({
      item_id: id,
      url: uploaded.url,
      thumb_url: uploaded.thumb_url,
      sort_order: nextOrder,
      is_primary: isFirst,
    })
    .select('*')
    .single();
  if (insErr) {
    console.error('item_photos insert failed', insErr.message);
    return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  if (isFirst) {
    await supabase
      .from('items')
      .update({
        primary_photo_url: uploaded.url,
        primary_photo_thumb_url: uploaded.thumb_url,
      })
      .eq('id', id)
      .eq('household_id', household.id);
  }

  return NextResponse.json({ photo: photoRow }, { status: 201 });
}
