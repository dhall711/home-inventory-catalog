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

/**
 * Parses an items search-params bag into our ItemFilters shape.
 * Multi-value filters accept either repeated keys (?category=art&category=watches)
 * OR a comma-separated single value (?category=art,watches). The sidebar uses
 * the comma form because it round-trips cleanly through URLSearchParams.set().
 */
export function parseItemFilters(sp: URLSearchParams): ItemFilters {
  const multi = (key: string): string[] => {
    const all = sp.getAll(key);
    const flat = all.flatMap((v) => v.split(',').map((s) => s.trim()).filter(Boolean));
    return Array.from(new Set(flat));
  };
  const trueish = (key: string) => sp.get(key) === 'true' || sp.get(key) === '1';

  const categories = multi('category') as CategorySlug[];
  const location_ids = multi('location_id');
  const collection_ids = multi('collection_id');
  const tag_ids = multi('tag_id');

  return {
    q: sp.get('q') ?? undefined,
    categories: categories.length > 1 ? categories : undefined,
    category: categories.length === 1 ? (categories[0] as CategorySlug) : undefined,
    location_ids: location_ids.length > 1 ? location_ids : undefined,
    location_id: location_ids.length === 1 ? location_ids[0] : undefined,
    collection_ids: collection_ids.length > 1 ? collection_ids : undefined,
    collection_id: collection_ids.length === 1 ? collection_ids[0] : undefined,
    tag_ids: tag_ids.length > 1 ? tag_ids : undefined,
    tag_id: tag_ids.length === 1 ? tag_ids[0] : undefined,
    status: (sp.get('status') as ItemFilters['status']) || undefined,
    min_value: sp.get('min_value') ? Number(sp.get('min_value')) : undefined,
    max_value: sp.get('max_value') ? Number(sp.get('max_value')) : undefined,
    acquired_from: sp.get('acquired_from') ?? undefined,
    acquired_to: sp.get('acquired_to') ?? undefined,
    added_from: sp.get('added_from') ?? undefined,
    added_to: sp.get('added_to') ?? undefined,
    has_serial: trueish('has_serial') || undefined,
    missing_serial: trueish('missing_serial') || undefined,
    has_photo: trueish('has_photo') || undefined,
    missing_photo: trueish('missing_photo') || undefined,
    missing_value: trueish('missing_value') || undefined,
    needs_review: trueish('needs_review') || undefined,
    page: sp.get('page') ? Number(sp.get('page')) : 1,
    page_size: sp.get('page_size') ? Number(sp.get('page_size')) : undefined,
    sort: (sp.get('sort') as SortOption) || undefined,
  };
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

  // ---- Multi-value filters take precedence over single-value equivalents ----
  if (filters.categories && filters.categories.length > 0) {
    query = query.in('category', filters.categories);
  } else if (filters.category) {
    query = query.eq('category', filters.category);
  }

  if (filters.location_ids && filters.location_ids.length > 0) {
    query = query.in('location_id', filters.location_ids);
  } else if (filters.location_id) {
    query = query.eq('location_id', filters.location_id);
  }

  if (filters.collection_ids && filters.collection_ids.length > 0) {
    query = query.in('collection_id', filters.collection_ids);
  } else if (filters.collection_id) {
    query = query.eq('collection_id', filters.collection_id);
  }

  if (filters.status) query = query.eq('status', filters.status);
  if (filters.needs_review) query = query.eq('status', 'review');

  if (typeof filters.min_value === 'number') query = query.gte('current_value', filters.min_value);
  if (typeof filters.max_value === 'number') query = query.lte('current_value', filters.max_value);

  if (filters.acquired_from) query = query.gte('acquired_date', filters.acquired_from);
  if (filters.acquired_to) query = query.lte('acquired_date', filters.acquired_to);
  if (filters.added_from) query = query.gte('created_at', filters.added_from);
  // Inclusive end-of-day for "added_to" so a same-day range works as expected.
  if (filters.added_to) query = query.lte('created_at', `${filters.added_to}T23:59:59.999Z`);

  // Quality flags
  if (filters.has_serial) query = query.not('serial_number', 'is', null);
  if (filters.missing_serial) query = query.is('serial_number', null);
  if (filters.has_photo) query = query.not('primary_photo_url', 'is', null);
  if (filters.missing_photo) query = query.is('primary_photo_url', null);
  if (filters.missing_value) query = query.is('current_value', null);

  if (filters.q && filters.q.trim()) {
    query = query.textSearch('search_text', filters.q.trim().split(/\s+/).join(' & '), {
      type: 'plain',
      config: 'simple',
    });
  }

  // Tag filter - resolve to item ids, then constrain.
  const tagIds: string[] = filters.tag_ids && filters.tag_ids.length > 0
    ? filters.tag_ids
    : filters.tag_id
    ? [filters.tag_id]
    : [];
  if (tagIds.length > 0) {
    const { data: tagged } = await supabase
      .from('item_tags')
      .select('item_id')
      .in('tag_id', tagIds);
    const ids = Array.from(new Set((tagged ?? []).map((r) => r.item_id)));
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
