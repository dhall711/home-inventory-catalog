import { createSupabaseServerClient } from '@/lib/supabase/server';
import {
  CATEGORY_TABLE_BY_SLUG,
  type CategorySlug,
  type Item,
  type ItemFilters,
  type SortOption,
} from '@/lib/types';

export const DEFAULT_PAGE_SIZE = 50;

export interface ItemListResult {
  items: Item[];
  total: number;
  page: number;
  page_size: number;
}

function parseSort(sort: SortOption | undefined): { column: string; ascending: boolean } {
  switch (sort) {
    case 'name_asc': return { column: 'name', ascending: true };
    case 'value_desc': return { column: 'current_value', ascending: false };
    case 'value_asc': return { column: 'current_value', ascending: true };
    case 'created_desc': return { column: 'created_at', ascending: false };
    case 'acquired_desc': return { column: 'acquired_date', ascending: false };
    case 'updated_desc':
    default:
      return { column: 'updated_at', ascending: false };
  }
}

export async function listItems(
  householdId: string,
  filters: ItemFilters
): Promise<ItemListResult> {
  const supabase = await createSupabaseServerClient();
  const page = Math.max(1, filters.page ?? 1);
  const page_size = filters.page_size ?? DEFAULT_PAGE_SIZE;
  const from = (page - 1) * page_size;
  const to = from + page_size - 1;
  const sort = parseSort(filters.sort);

  let query = supabase
    .from('items')
    .select('*', { count: 'exact' })
    .eq('household_id', householdId)
    .range(from, to)
    .order(sort.column, { ascending: sort.ascending, nullsFirst: false });

  if (filters.category) query = query.eq('category', filters.category);
  if (filters.location_id) query = query.eq('location_id', filters.location_id);
  if (filters.collection_id) query = query.eq('collection_id', filters.collection_id);
  if (filters.status) query = query.eq('status', filters.status);
  if (typeof filters.min_value === 'number') query = query.gte('current_value', filters.min_value);
  if (typeof filters.max_value === 'number') query = query.lte('current_value', filters.max_value);
  if (filters.has_serial) query = query.not('serial_number', 'is', null);
  if (filters.q && filters.q.trim()) {
    // Use textSearch if non-trivial; fallback to ilike on name
    query = query.textSearch('search_text', filters.q.trim().split(/\s+/).join(' & '), {
      type: 'plain',
      config: 'simple',
    });
  }
  if (filters.tag_id) {
    const { data: tagged } = await supabase
      .from('item_tags')
      .select('item_id')
      .eq('tag_id', filters.tag_id);
    const ids = (tagged ?? []).map((r) => r.item_id);
    if (ids.length === 0) return { items: [], total: 0, page, page_size };
    query = query.in('id', ids);
  }

  const { data, count, error } = await query;
  if (error) throw error;
  return {
    items: (data ?? []) as Item[],
    total: count ?? 0,
    page,
    page_size,
  };
}

export async function getItemDetail(householdId: string, itemId: string) {
  const supabase = await createSupabaseServerClient();
  const { data: item, error } = await supabase
    .from('items')
    .select('*')
    .eq('household_id', householdId)
    .eq('id', itemId)
    .single();
  if (error || !item) return null;

  const [photos, attachments, valueHistory, tagRows] = await Promise.all([
    supabase.from('item_photos').select('*').eq('item_id', itemId).order('sort_order'),
    supabase.from('item_attachments').select('*').eq('item_id', itemId).order('uploaded_at', { ascending: false }),
    supabase.from('value_history').select('*').eq('item_id', itemId).order('dated_on', { ascending: true }),
    supabase.from('item_tags').select('tag_id, tags(name)').eq('item_id', itemId),
  ]);

  let attributes: Record<string, unknown> | null = null;
  const attrTable = CATEGORY_TABLE_BY_SLUG[item.category as CategorySlug];
  if (attrTable) {
    const { data: attr } = await supabase.from(attrTable).select('*').eq('item_id', itemId).maybeSingle();
    attributes = attr ?? null;
  }

  return {
    item: item as Item,
    photos: photos.data ?? [],
    attachments: attachments.data ?? [],
    valueHistory: valueHistory.data ?? [],
    tags: ((tagRows.data ?? []) as Array<{ tag_id: string; tags: { name: string } | { name: string }[] | null }>).map((r) => ({
      id: r.tag_id,
      name: Array.isArray(r.tags) ? r.tags[0]?.name ?? '' : r.tags?.name ?? '',
    })),
    attributes,
  };
}

export async function upsertItemAttributes(
  itemId: string,
  category: CategorySlug,
  attributes: Record<string, unknown>
) {
  const table = CATEGORY_TABLE_BY_SLUG[category];
  if (!table) return;
  const supabase = await createSupabaseServerClient();
  await supabase.from(table).upsert({ item_id: itemId, ...attributes });
}
