import { NextResponse } from 'next/server';
import { requireHousehold } from '@/lib/household';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { CategorySlug, ItemStatus } from '@/lib/types';

export const dynamic = 'force-dynamic';

type BulkAction =
  | 'move_location'
  | 'move_collection'
  | 'change_category'
  | 'add_tags'
  | 'change_status'
  | 'delete';

interface BulkPayload {
  item_ids: string[];
  action: BulkAction;
  location_id?: string | null;
  collection_id?: string | null;
  category?: CategorySlug;
  status?: ItemStatus;
  tag_names?: string[];
}

/**
 * Apply a single bulk action to a set of items in the caller's household.
 * RLS already restricts access, but we additionally re-scope every write
 * to .eq('household_id') so a malicious client can't update items they
 * don't own even if RLS were misconfigured.
 */
export async function POST(req: Request) {
  const household = await requireHousehold();
  const supabase = await createSupabaseServerClient();

  const body = (await req.json()) as BulkPayload;
  if (!body.item_ids || !Array.isArray(body.item_ids) || body.item_ids.length === 0) {
    return NextResponse.json({ error: 'item_ids required' }, { status: 400 });
  }
  if (body.item_ids.length > 500) {
    return NextResponse.json({ error: 'Too many items in one batch (max 500).' }, { status: 400 });
  }

  const ids = body.item_ids;

  switch (body.action) {
    case 'move_location': {
      const { error } = await supabase
        .from('items')
        .update({ location_id: body.location_id ?? null })
        .eq('household_id', household.id)
        .in('id', ids);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ ok: true, updated: ids.length });
    }
    case 'move_collection': {
      const { error } = await supabase
        .from('items')
        .update({ collection_id: body.collection_id ?? null })
        .eq('household_id', household.id)
        .in('id', ids);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ ok: true, updated: ids.length });
    }
    case 'change_category': {
      if (!body.category) {
        return NextResponse.json({ error: 'category required' }, { status: 400 });
      }
      // Note: this leaves any old per-category attribute rows orphaned.
      // The detail UI just stops showing them, which is intentional - users
      // get to keep the data if they revert. A separate cleanup pass can
      // hard-delete them later via Settings.
      const { error } = await supabase
        .from('items')
        .update({ category: body.category })
        .eq('household_id', household.id)
        .in('id', ids);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ ok: true, updated: ids.length });
    }
    case 'change_status': {
      if (!body.status) {
        return NextResponse.json({ error: 'status required' }, { status: 400 });
      }
      const { error } = await supabase
        .from('items')
        .update({ status: body.status })
        .eq('household_id', household.id)
        .in('id', ids);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ ok: true, updated: ids.length });
    }
    case 'add_tags': {
      const names = (body.tag_names ?? [])
        .map((n) => n.trim())
        .filter(Boolean);
      if (names.length === 0) {
        return NextResponse.json({ error: 'tag_names required' }, { status: 400 });
      }

      const unique = Array.from(new Set(names));
      const { data: existing } = await supabase
        .from('tags')
        .select('id, name')
        .eq('household_id', household.id)
        .in('name', unique);
      const byName = new Map<string, string>();
      for (const t of existing ?? []) byName.set(t.name, t.id);
      const toCreate = unique.filter((n) => !byName.has(n));
      if (toCreate.length > 0) {
        const { data: created, error: createErr } = await supabase
          .from('tags')
          .insert(toCreate.map((name) => ({ household_id: household.id, name })))
          .select('id, name');
        if (createErr) return NextResponse.json({ error: createErr.message }, { status: 400 });
        for (const t of created ?? []) byName.set(t.name, t.id);
      }

      // Verify all ids belong to this household before linking tags.
      const { data: validItems } = await supabase
        .from('items')
        .select('id')
        .eq('household_id', household.id)
        .in('id', ids);
      const validIds = (validItems ?? []).map((r) => r.id);
      const rows: { item_id: string; tag_id: string }[] = [];
      for (const itemId of validIds) {
        for (const name of unique) {
          const tagId = byName.get(name);
          if (tagId) rows.push({ item_id: itemId, tag_id: tagId });
        }
      }
      if (rows.length > 0) {
        const { error } = await supabase.from('item_tags').upsert(rows, { onConflict: 'item_id,tag_id' });
        if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      }
      return NextResponse.json({ ok: true, updated: validIds.length });
    }
    case 'delete': {
      const { error } = await supabase
        .from('items')
        .delete()
        .eq('household_id', household.id)
        .in('id', ids);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ ok: true, deleted: ids.length });
    }
    default:
      return NextResponse.json({ error: `Unknown action: ${body.action}` }, { status: 400 });
  }
}
