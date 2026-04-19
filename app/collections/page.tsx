import { requireHousehold } from '@/lib/household';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { CollectionsManager } from '@/components/CollectionsManager';
import type { CategorySlug } from '@/lib/types';

export const dynamic = 'force-dynamic';

interface CollectionRow {
  id: string;
  name: string;
  description: string | null;
  default_category: CategorySlug | null;
  cover_photo_url: string | null;
  notes: string | null;
}

export default async function CollectionsPage() {
  const household = await requireHousehold();
  const supabase = await createSupabaseServerClient();

  const { data: collectionsData } = await supabase
    .from('collections')
    .select('id, name, description, default_category, cover_photo_url, notes')
    .eq('household_id', household.id)
    .order('name');

  const collections = (collectionsData ?? []) as CollectionRow[];

  // Precompute per-collection item count and total current value so the
  // grid view can show useful at-a-glance stats.
  const counts = new Map<string, { item_count: number; total_value: number }>();
  if (collections.length > 0) {
    const { data: items } = await supabase
      .from('items')
      .select('collection_id, current_value')
      .eq('household_id', household.id)
      .not('collection_id', 'is', null);
    for (const it of items ?? []) {
      const id = (it as { collection_id: string }).collection_id;
      const v = Number((it as { current_value: number | null }).current_value ?? 0);
      const cur = counts.get(id) ?? { item_count: 0, total_value: 0 };
      cur.item_count += 1;
      cur.total_value += isFinite(v) ? v : 0;
      counts.set(id, cur);
    }
  }

  const rows = collections.map((c) => ({
    ...c,
    item_count: counts.get(c.id)?.item_count ?? 0,
    total_value: counts.get(c.id)?.total_value ?? 0,
  }));

  return (
    <div className="space-y-4 max-w-6xl">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold">Collections</h1>
        <span className="text-sm text-brand-300">{rows.length} collections</span>
      </div>
      <p className="text-sm text-brand-300">
        Group related items - e.g., &ldquo;Vintage Pipes,&rdquo; &ldquo;Native American Jewelry,&rdquo;
        &ldquo;Lladró Figurines,&rdquo; &ldquo;Objet d&rsquo;Art.&rdquo; Set a default category so new items added to
        the collection get the right schema automatically.
      </p>
      <CollectionsManager householdId={household.id} rows={rows} />
    </div>
  );
}
