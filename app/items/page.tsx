import Link from 'next/link';
import { requireHousehold } from '@/lib/household';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { listItems, parseItemFilters } from '@/lib/items';
import { FilterSidebar } from '@/components/FilterSidebar';
import { ItemsView } from '@/components/ItemsView';
import { QuickFilterChips } from '@/components/QuickFilterChips';

export const dynamic = 'force-dynamic';

export default async function ItemsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const household = await requireHousehold();
  const supabase = await createSupabaseServerClient();

  // Reconstruct a URLSearchParams from Next's sp shape so we can reuse the
  // same parser the API route uses (handles repeated keys + comma-lists).
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (Array.isArray(v)) v.forEach((x) => x && usp.append(k, x));
    else if (v) usp.append(k, v);
  }
  const filters = parseItemFilters(usp);

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
        <QuickFilterChips />
        <ItemsView
          items={items}
          total={total}
          page={page}
          pageSize={page_size}
          currency={household.currency}
          locations={locations.data ?? []}
          collections={collections.data ?? []}
        />
      </section>
    </div>
  );
}
