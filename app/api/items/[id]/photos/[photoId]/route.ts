import { NextResponse } from 'next/server';
import { requireHousehold } from '@/lib/household';
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { PHOTO_BUCKET } from '@/lib/storage';

export const runtime = 'nodejs';

interface PatchBody {
  is_primary?: boolean;
  sort_order?: number;
}

/**
 * PATCH /api/items/[id]/photos/[photoId]
 * Set as primary or reorder. Setting is_primary=true also clears the
 * flag on every other photo for this item AND syncs items.primary_photo_url
 * so cards/dashboards/PDFs all reflect the new hero image.
 */
export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string; photoId: string }> }
) {
  const { id, photoId } = await ctx.params;
  const household = await requireHousehold();
  const supabase = await createSupabaseServerClient();

  // Confirm parent item belongs to this household.
  const { data: item } = await supabase
    .from('items')
    .select('id')
    .eq('id', id)
    .eq('household_id', household.id)
    .single();
  if (!item) return NextResponse.json({ error: 'item not found' }, { status: 404 });

  const body = (await request.json().catch(() => null)) as PatchBody | null;
  if (!body) return NextResponse.json({ error: 'invalid body' }, { status: 400 });

  // Load the target photo.
  const { data: photo } = await supabase
    .from('item_photos')
    .select('*')
    .eq('id', photoId)
    .eq('item_id', id)
    .single();
  if (!photo) return NextResponse.json({ error: 'photo not found' }, { status: 404 });

  if (body.is_primary === true) {
    // Clear is_primary on siblings, then set this one.
    await supabase
      .from('item_photos')
      .update({ is_primary: false })
      .eq('item_id', id)
      .neq('id', photoId);
    await supabase
      .from('item_photos')
      .update({ is_primary: true })
      .eq('id', photoId);
    // Mirror onto items so the hero image and list thumbnails update.
    await supabase
      .from('items')
      .update({
        primary_photo_url: photo.url,
        primary_photo_thumb_url: photo.thumb_url,
      })
      .eq('id', id)
      .eq('household_id', household.id);
  }

  if (typeof body.sort_order === 'number') {
    await supabase
      .from('item_photos')
      .update({ sort_order: body.sort_order })
      .eq('id', photoId);
  }

  const { data: updated } = await supabase
    .from('item_photos')
    .select('*')
    .eq('id', photoId)
    .single();
  return NextResponse.json({ photo: updated });
}

/**
 * DELETE /api/items/[id]/photos/[photoId]
 * Removes the row + best-effort deletes the underlying storage objects.
 * If the deleted photo was the primary, the next available photo is
 * promoted (and items.primary_photo_url is updated). If no photos remain,
 * items.primary_photo_url is cleared.
 */
export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string; photoId: string }> }
) {
  const { id, photoId } = await ctx.params;
  const household = await requireHousehold();
  const supabase = await createSupabaseServerClient();

  const { data: item } = await supabase
    .from('items')
    .select('id, primary_photo_url')
    .eq('id', id)
    .eq('household_id', household.id)
    .single();
  if (!item) return NextResponse.json({ error: 'item not found' }, { status: 404 });

  const { data: photo } = await supabase
    .from('item_photos')
    .select('*')
    .eq('id', photoId)
    .eq('item_id', id)
    .single();
  if (!photo) return NextResponse.json({ error: 'photo not found' }, { status: 404 });

  await supabase.from('item_photos').delete().eq('id', photoId);

  // Best-effort storage cleanup. Storage paths are derived from the public
  // URL: ".../object/public/item-photos/<path>".
  const supa = createSupabaseServiceRoleClient();
  const toRemove: string[] = [];
  const extractPath = (publicUrl: string | null) => {
    if (!publicUrl) return null;
    const marker = `/object/public/${PHOTO_BUCKET}/`;
    const idx = publicUrl.indexOf(marker);
    return idx >= 0 ? publicUrl.slice(idx + marker.length) : null;
  };
  const fullPath = extractPath(photo.url);
  const thumbPath = extractPath(photo.thumb_url);
  if (fullPath) toRemove.push(fullPath);
  if (thumbPath) toRemove.push(thumbPath);
  if (toRemove.length > 0) {
    await supa.storage.from(PHOTO_BUCKET).remove(toRemove).catch(() => null);
  }

  // If we just removed the primary photo, promote the next available one
  // (or clear it). Use sort_order then created_at for deterministic choice.
  if (photo.is_primary || photo.url === item.primary_photo_url) {
    const { data: next } = await supabase
      .from('item_photos')
      .select('id, url, thumb_url')
      .eq('item_id', id)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (next) {
      await supabase
        .from('item_photos')
        .update({ is_primary: true })
        .eq('id', next.id);
      await supabase
        .from('items')
        .update({
          primary_photo_url: next.url,
          primary_photo_thumb_url: next.thumb_url,
        })
        .eq('id', id);
    } else {
      await supabase
        .from('items')
        .update({ primary_photo_url: null, primary_photo_thumb_url: null })
        .eq('id', id);
    }
  }

  return NextResponse.json({ ok: true });
}
