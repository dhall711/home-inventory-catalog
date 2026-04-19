import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireHousehold } from '@/lib/household';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { ItemCard } from '@/components/ItemCard';
import { formatCurrency } from '@/lib/format';
import { CATEGORIES, type CategorySlug, type Collection, type Item } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function CollectionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const household = await requireHousehold();
  const supabase = await createSupabaseServerClient();

  const { data: coll } = await supabase
    .from('collections')
    .select('id, household_id, name, description, default_category, cover_photo_url, notes')
    .eq('id', id)
    .eq('household_id', household.id)
    .maybeSingle();
  if (!coll) notFound();
  const collection = coll as Collection;

  const { data: itemsData } = await supabase
    .from('items')
    .select('*')
    .eq('household_id', household.id)
    .eq('collection_id', id)
    .order('updated_at', { ascending: false })
    .limit(500);
  const items = (itemsData ?? []) as Item[];

  const totalValue = items.reduce((sum, it) => sum + Number(it.current_value ?? 0), 0);
  const insured = items.filter((it) => (it.current_value ?? 0) > 0).length;
  const breakdown = new Map<string, { count: number; value: number }>();
  for (const it of items) {
    const cur = breakdown.get(it.category) ?? { count: 0, value: 0 };
    cur.count += 1;
    cur.value += Number(it.current_value ?? 0);
    breakdown.set(it.category, cur);
  }
  const sortedBreakdown = Array.from(breakdown.entries()).sort((a, b) => b[1].value - a[1].value);

  const defaultCategoryLabel = collection.default_category
    ? CATEGORIES.find((c) => c.slug === collection.default_category)?.name ?? collection.default_category
    : null;

  const newItemHref = collection.default_category
    ? `/items/new?collection=${collection.id}&category=${collection.default_category}`
    : `/items/new?collection=${collection.id}`;

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="grid lg:grid-cols-[300px_1fr] gap-6">
        <div className="card overflow-hidden">
          <div className="aspect-video bg-brand-950/40">
            {collection.cover_photo_url ? (
              <img src={collection.cover_photo_url} alt={collection.name} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-sm text-brand-400">
                No cover photo
              </div>
            )}
          </div>
          <div className="p-3 text-xs text-brand-300 space-y-1">
            <div className="flex justify-between"><span>Items</span><span>{items.length}</span></div>
            <div className="flex justify-between"><span>Insured / valued</span><span>{insured}</span></div>
            <div className="flex justify-between"><span>Total value</span><span className="font-semibold text-accent">{formatCurrency(totalValue, household.currency)}</span></div>
            {defaultCategoryLabel && (
              <div className="flex justify-between"><span>Default category</span><span>{defaultCategoryLabel}</span></div>
            )}
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-baseline gap-3 flex-wrap">
            <Link href="/collections" className="text-xs text-brand-400 hover:text-brand-200">
              ← All collections
            </Link>
          </div>
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h1 className="text-2xl font-semibold">{collection.name}</h1>
              {collection.description && <p className="text-sm text-brand-300 mt-1">{collection.description}</p>}
            </div>
            <Link href={newItemHref} className="btn-primary">+ Add item</Link>
          </div>

          {collection.notes && (
            <div className="card p-4 text-sm whitespace-pre-wrap text-brand-200">{collection.notes}</div>
          )}

          {sortedBreakdown.length > 0 && (
            <div className="card p-4 space-y-2">
              <div className="text-sm font-medium">Breakdown by category</div>
              <ul className="text-xs text-brand-300 space-y-1">
                {sortedBreakdown.map(([slug, { count, value }]) => (
                  <li key={slug} className="flex items-center justify-between">
                    <span className="capitalize">
                      {CATEGORIES.find((c) => c.slug === (slug as CategorySlug))?.name ?? slug.replace('_', ' ')}
                      <span className="ml-2 text-brand-400">×{count}</span>
                    </span>
                    <span className="text-accent font-semibold">
                      {formatCurrency(value, household.currency)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Items in this collection</h2>
        {items.length === 0 ? (
          <div className="card p-8 text-center text-sm text-brand-300">
            No items yet.{' '}
            <Link href={newItemHref} className="text-accent-400 hover:underline">
              Add the first one.
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {items.map((item) => (
              <ItemCard key={item.id} item={item} currency={household.currency} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
