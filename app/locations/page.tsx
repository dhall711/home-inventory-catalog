import { requireHousehold } from '@/lib/household';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { SimpleListManager } from '@/components/SimpleListManager';

export const dynamic = 'force-dynamic';

export default async function LocationsPage() {
  const household = await requireHousehold();
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('locations')
    .select('id, name, parent_id')
    .eq('household_id', household.id)
    .order('name');

  return (
    <div className="space-y-4 max-w-3xl">
      <h1 className="text-2xl font-semibold">Locations</h1>
      <p className="text-sm text-brand-300">Hierarchical: e.g. House &gt; Living Room &gt; Bookshelf.</p>
      <SimpleListManager table="locations" householdId={household.id} rows={data ?? []} showParent />
    </div>
  );
}
