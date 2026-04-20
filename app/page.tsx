import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireHousehold } from '@/lib/household';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';
import { formatCurrency, formatDate } from '@/lib/format';
import { CategoryBreakdownChart } from '@/components/CategoryBreakdownChart';
import type { Item } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const household = await requireHousehold();
  const supabase = await createSupabaseServerClient();

  // First-run wizard: brand-new households (zero items) get redirected once.
  // Honor a "skipped" cookie so the user isn't trapped if they bounce back.
  const cookieStore = await cookies();
  const skipped = cookieStore.get('onboarding_skipped')?.value === '1';
  if (!skipped) {
    const { count: itemCount } = await supabase
      .from('items')
      .select('id', { count: 'exact', head: true })
      .eq('household_id', household.id);
    if ((itemCount ?? 0) === 0) {
      redirect('/onboarding');
    }
  }

  const [{ count: totalItems }, valueAgg, recent, reviewing] = await Promise.all([
    supabase.from('items').select('id', { count: 'exact', head: true }).eq('household_id', household.id).eq('status', 'active'),
    supabase.from('items').select('category, current_value').eq('household_id', household.id).eq('status', 'active'),
    supabase
      .from('items')
      .select('*')
      .eq('household_id', household.id)
      .order('created_at', { ascending: false })
      .limit(8),
    supabase
      .from('items')
      .select('id', { count: 'exact', head: true })
      .eq('household_id', household.id)
      .eq('status', 'review'),
  ]);

  const byCategory = new Map<string, { value: number; count: number }>();
  let totalValue = 0;
  for (const r of valueAgg.data ?? []) {
    const v = Number(r.current_value) || 0;
    totalValue += v;
    const cur = byCategory.get(r.category) ?? { value: 0, count: 0 };
    cur.value += v;
    cur.count += 1;
    byCategory.set(r.category, cur);
  }
  const breakdown = Array.from(byCategory.entries())
    .map(([category, v]) => ({ category, ...v }))
    .sort((a, b) => b.value - a.value);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Dashboard</h1>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Active items" value={(totalItems ?? 0).toLocaleString()} link="/items" />
        <Stat label="Total insured value" value={formatCurrency(totalValue, household.currency)} link="/reports" />
        <Stat label="Categories" value={breakdown.length.toString()} />
        <Stat
          label="Awaiting review"
          value={(reviewing.count ?? 0).toLocaleString()}
          link="/items?status=review"
          highlight={(reviewing.count ?? 0) > 0}
        />
      </div>

      <section className="card p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-medium">Ask the assistant</h2>
          <Link href="/chat" className="text-sm text-brand-300 hover:text-brand-100">Open chat &rarr;</Link>
        </div>
        <div className="grid sm:grid-cols-2 gap-2">
          {[
            'What is my most valuable item?',
            'How is my inventory broken down by category?',
            'Which items are missing photos or values?',
            'Summarize my collections.',
          ].map((q) => (
            <Link
              key={q}
              href={`/chat/new?q=${encodeURIComponent(q)}`}
              className="text-sm px-3 py-2 rounded border border-brand-800 hover:bg-brand-800/40 text-brand-200"
            >
              {q}
            </Link>
          ))}
        </div>
      </section>

      <section className="card p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-medium">Value by category</h2>
          <Link href="/reports" className="text-sm text-brand-300 hover:text-brand-100">Build report &rarr;</Link>
        </div>
        {breakdown.length === 0 ? (
          <div className="text-sm text-brand-300">Add items to see a breakdown.</div>
        ) : (
          <CategoryBreakdownChart data={breakdown} currency={household.currency} />
        )}
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">Recently added</h2>
          <Link href="/items?sort=created_desc" className="text-sm text-brand-300 hover:text-brand-100">All &rarr;</Link>
        </div>
        {(!recent.data || recent.data.length === 0) ? (
          <div className="card p-6 text-center">
            <p className="text-brand-300 mb-3">Nothing here yet.</p>
            <div className="flex justify-center gap-2">
              <Link href="/items/new" className="btn-primary">Add your first item</Link>
              <Link href="/batch" className="btn-secondary">Or batch capture</Link>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
            {(recent.data as Item[]).map((it) => (
              <Link key={it.id} href={`/items/${it.id}`} className="card overflow-hidden">
                <div className="aspect-square bg-brand-950">
                  {it.primary_photo_thumb_url || it.primary_photo_url ? (
                    <img src={it.primary_photo_thumb_url ?? it.primary_photo_url ?? ''} alt={it.name} className="w-full h-full object-cover" />
                  ) : null}
                </div>
                <div className="p-2 text-xs">
                  <div className="truncate">{it.name}</div>
                  <div className="text-brand-400 truncate">{formatDate(it.created_at)}</div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, link, highlight }: { label: string; value: string; link?: string; highlight?: boolean }) {
  const content = (
    <div className={`card p-4 h-full ${highlight ? 'border-accent/60' : ''}`}>
      <div className="text-xs uppercase tracking-wider text-brand-300">{label}</div>
      <div className={`text-2xl font-semibold mt-1 ${highlight ? 'text-accent' : ''}`}>{value}</div>
    </div>
  );
  return link ? <Link href={link}>{content}</Link> : content;
}
