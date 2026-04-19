import { notFound } from 'next/navigation';
import { requireHousehold } from '@/lib/household';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getItemDetail } from '@/lib/items';
import { ItemForm } from '@/components/ItemForm';

export const dynamic = 'force-dynamic';

export default async function EditItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const household = await requireHousehold();
  const detail = await getItemDetail(household.id, id);
  if (!detail) notFound();

  const supabase = await createSupabaseServerClient();
  const [locations, collections, tags] = await Promise.all([
    supabase.from('locations').select('id, name').eq('household_id', household.id).order('name'),
    supabase.from('collections').select('id, name').eq('household_id', household.id).order('name'),
    supabase.from('tags').select('id, name').eq('household_id', household.id).order('name'),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Edit item</h1>
      <ItemForm
        mode="edit"
        item={detail.item}
        attributes={detail.attributes}
        initialTags={detail.tags.map((t) => t.name)}
        initialPhotoUrl={detail.item.primary_photo_url}
        initialPhotoThumbUrl={detail.item.primary_photo_thumb_url}
        locations={locations.data ?? []}
        collections={collections.data ?? []}
        allTags={tags.data ?? []}
      />
    </div>
  );
}
