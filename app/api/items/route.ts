import { NextResponse } from 'next/server';
import { requireHousehold } from '@/lib/household';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { listItems, parseItemFilters, upsertItemAttributes } from '@/lib/items';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const household = await requireHousehold();
  const url = new URL(request.url);
  const filters = parseItemFilters(url.searchParams);
  const result = await listItems(household.id, filters);
  return NextResponse.json(result);
}

export async function POST(request: Request) {
  const household = await requireHousehold();
  const supabase = await createSupabaseServerClient();
  const body = await request.json();
  const { attributes, tags, initial_value, ...itemFields } = body as {
    attributes?: Record<string, unknown>;
    tags?: string[];
    initial_value?: number;
    [k: string]: unknown;
  };

  const { data: created, error } = await supabase
    .from('items')
    .insert({
      ...itemFields,
      household_id: household.id,
    })
    .select('*')
    .single();
  if (error || !created) {
    return NextResponse.json({ error: error?.message ?? 'Insert failed' }, { status: 400 });
  }

  if (attributes && Object.keys(attributes).length > 0) {
    await upsertItemAttributes(created.id, created.category, attributes);
  }

  if (typeof initial_value === 'number' && initial_value > 0) {
    await supabase.from('value_history').insert({
      item_id: created.id,
      value: initial_value,
      source: created.current_value_source ?? 'manual',
      dated_on: new Date().toISOString().slice(0, 10),
      notes: 'Initial value',
    });
  }

  if (tags && tags.length > 0) {
    await syncItemTags(created.id, household.id, tags);
  }

  return NextResponse.json({ item: created }, { status: 201 });
}

async function syncItemTags(itemId: string, householdId: string, tagNames: string[]) {
  const supabase = await createSupabaseServerClient();
  const cleanNames = Array.from(new Set(tagNames.map((t) => t.trim()).filter(Boolean)));
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

  await supabase.from('item_tags').delete().eq('item_id', itemId);
  await supabase.from('item_tags').insert(
    cleanNames.map((n) => ({ item_id: itemId, tag_id: existingByName.get(n)! }))
  );
}
