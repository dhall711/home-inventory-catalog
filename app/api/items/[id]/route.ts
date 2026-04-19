import { NextResponse } from 'next/server';
import { requireHousehold } from '@/lib/household';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { upsertItemAttributes } from '@/lib/items';
import type { CategorySlug } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const household = await requireHousehold();
  const supabase = await createSupabaseServerClient();
  const body = await request.json();
  const { attributes, tags, ...fields } = body as {
    attributes?: Record<string, unknown>;
    tags?: string[];
    [k: string]: unknown;
  };

  const { data: updated, error } = await supabase
    .from('items')
    .update(fields)
    .eq('id', id)
    .eq('household_id', household.id)
    .select('*')
    .single();
  if (error || !updated) return NextResponse.json({ error: error?.message ?? 'not found' }, { status: 404 });

  if (attributes && Object.keys(attributes).length > 0) {
    await upsertItemAttributes(updated.id, updated.category as CategorySlug, attributes);
  }

  if (Array.isArray(tags)) {
    await syncTags(updated.id, household.id, tags);
  }

  return NextResponse.json({ item: updated });
}

export async function DELETE(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const household = await requireHousehold();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from('items').delete().eq('id', id).eq('household_id', household.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}

async function syncTags(itemId: string, householdId: string, tagNames: string[]) {
  const supabase = await createSupabaseServerClient();
  const cleanNames = Array.from(new Set(tagNames.map((t) => t.trim()).filter(Boolean)));
  await supabase.from('item_tags').delete().eq('item_id', itemId);
  if (cleanNames.length === 0) return;

  const { data: existingTags } = await supabase
    .from('tags')
    .select('id, name')
    .eq('household_id', householdId)
    .in('name', cleanNames);

  const existingByName = new Map((existingTags ?? []).map((t) => [t.name, t.id]));
  const toCreate = cleanNames.filter((n) => !existingByName.has(n));

  if (toCreate.length > 0) {
    const { data: created } = await supabase
      .from('tags')
      .insert(toCreate.map((name) => ({ household_id: householdId, name })))
      .select('id, name');
    for (const t of created ?? []) existingByName.set(t.name, t.id);
  }

  await supabase.from('item_tags').insert(
    cleanNames.map((n) => ({ item_id: itemId, tag_id: existingByName.get(n)! }))
  );
}
