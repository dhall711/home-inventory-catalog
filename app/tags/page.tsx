import { requireHousehold } from '@/lib/household';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { SimpleListManager } from '@/components/SimpleListManager';

export const dynamic = 'force-dynamic';

export default async function TagsPage() {
  const household = await requireHousehold();
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('tags')
    .select('id, name')
    .eq('household_id', household.id)
    .order('name');

  return (
    <div className="space-y-4 max-w-3xl">
      <h1 className="text-2xl font-semibold">Tags</h1>
      <p className="text-sm text-brand-300">Free-form labels for cross-cutting filters.</p>
      <SimpleListManager table="tags" householdId={household.id} rows={data ?? []} />
    </div>
  );
}
