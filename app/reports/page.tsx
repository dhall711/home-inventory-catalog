import { requireHousehold } from '@/lib/household';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { ReportBuilderClient } from './ReportBuilderClient';
import { formatCurrency, formatDate } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function ReportsPage() {
  const household = await requireHousehold();
  const supabase = await createSupabaseServerClient();
  const [locations, collections, tags, recent] = await Promise.all([
    supabase.from('locations').select('id, name').eq('household_id', household.id).order('name'),
    supabase.from('collections').select('id, name').eq('household_id', household.id).order('name'),
    supabase.from('tags').select('id, name').eq('household_id', household.id).order('name'),
    supabase
      .from('reports')
      .select('id, name, item_count, total_value, pdf_url, csv_url, created_at')
      .eq('household_id', household.id)
      .order('created_at', { ascending: false })
      .limit(10),
  ]);

  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="text-2xl font-semibold">Reports</h1>
      <p className="text-brand-200 text-sm">
        Generate insurance schedules. Filter the items to include, then export PDF and CSV.
        Recent reports are saved and can be re-downloaded for 7 days.
      </p>
      <ReportBuilderClient
        currency={household.currency}
        locations={locations.data ?? []}
        collections={collections.data ?? []}
        tags={tags.data ?? []}
      />

      {(recent.data?.length ?? 0) > 0 && (
        <section className="card p-4 space-y-2">
          <h2 className="font-medium">Recent reports</h2>
          <ul className="divide-y divide-brand-800">
            {recent.data!.map((r) => (
              <li key={r.id} className="py-2 flex items-center justify-between gap-2 text-sm">
                <div className="min-w-0">
                  <div className="truncate">{r.name}</div>
                  <div className="text-xs text-brand-400">
                    {r.item_count} items • {formatCurrency(Number(r.total_value), household.currency)} • {formatDate(r.created_at)}
                  </div>
                </div>
                <div className="flex gap-2">
                  {r.pdf_url && <a href={r.pdf_url} target="_blank" rel="noreferrer" className="btn-ghost">PDF</a>}
                  {r.csv_url && <a href={r.csv_url} target="_blank" rel="noreferrer" className="btn-ghost">CSV</a>}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
