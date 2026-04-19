import { requireHousehold } from '@/lib/household';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { NewItemClient } from './NewItemClient';
import { CATEGORIES, type CategorySlug } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function NewItemPage({
  searchParams,
}: {
  searchParams: Promise<{ collection?: string; category?: string }>;
}) {
  const sp = await searchParams;
  const household = await requireHousehold();
  const supabase = await createSupabaseServerClient();
  const [locations, collections, tags] = await Promise.all([
    supabase.from('locations').select('id, name').eq('household_id', household.id).order('name'),
    supabase.from('collections').select('id, name').eq('household_id', household.id).order('name'),
    supabase.from('tags').select('id, name').eq('household_id', household.id).order('name'),
  ]);

  const initialCategory =
    sp.category && CATEGORIES.some((c) => c.slug === sp.category)
      ? (sp.category as CategorySlug)
      : undefined;
  const initialCollectionId =
    sp.collection && (collections.data ?? []).some((c) => c.id === sp.collection) ? sp.collection : undefined;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Add item</h1>
      <NewItemClient
        locations={locations.data ?? []}
        collections={collections.data ?? []}
        tags={tags.data ?? []}
        initialCategory={initialCategory}
        initialCollectionId={initialCollectionId}
      />
    </div>
  );
}
