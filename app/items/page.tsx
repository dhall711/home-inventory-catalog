import Link from 'next/link';
import { requireHousehold } from '@/lib/household';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { listItems, DEFAULT_PAGE_SIZE } from '@/lib/items';
import type { CategorySlug, ItemFilters, ItemStatus, SortOption } from '@/lib/types';
import { FilterSidebar } from '@/components/FilterSidebar';
import { ItemsView } from '@/components/ItemsView';

export const dynamic = 'force-dynamic';

interface SearchParams {
  q?: string;
  category?: string;
  location_id?: string;
  collection_id?: string;
  tag_id?: string;
  status?: string;
  min_value?: string;
  max_value?: string;
  has_serial?: string;
  page?: string;
  sort?: string;
}

export default async function ItemsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const household = await requireHousehold();
  const supabase = await createSupabaseServerClient();

  const filters: ItemFilters = {
    q: sp.q || undefined,
    category: (sp.category as CategorySlug) || undefined,
    location_id: sp.location_id || undefined,
    collection_id: sp.collection_id || undefined,
    tag_id: sp.tag_id || undefined,
    status: (sp.status as ItemStatus) || undefined,
    min_value: sp.min_value ? Number(sp.min_value) : undefined,
    max_value: sp.max_value ? Number(sp.max_value) : undefined,
    has_serial: sp.has_serial === 'true' ? true : undefined,
    page: sp.page ? Number(sp.page) : 1,
    sort: (sp.sort as SortOption) || undefined,
  };

  const [{ items, total, page, page_size }, locations, collections, tags] = await Promise.all([
    listItems(household.id, filters),
    supabase.from('locations').select('id, name').eq('household_id', household.id).order('name'),
    supabase.from('collections').select('id, name').eq('household_id', household.id).order('name'),
    supabase.from('tags').select('id, name').eq('household_id', household.id).order('name'),
  ]);

  return (
    <div className="grid lg:grid-cols-[260px_1fr] gap-6">
      <FilterSidebar
        locations={locations.data ?? []}
        collections={collections.data ?? []}
        tags={tags.data ?? []}
        totalCount={total}
      />
      <section className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h1 className="text-2xl font-semibold">Items</h1>
          <div className="flex gap-2">
            <Link href="/batch" className="btn-secondary">Batch capture</Link>
            <Link href="/items/new" className="btn-primary">Add item</Link>
          </div>
        </div>
        <ItemsView items={items} total={total} page={page} pageSize={page_size} currency={household.currency} />
      </section>
    </div>
  );
}
