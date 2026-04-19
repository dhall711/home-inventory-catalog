import Link from 'next/link';
import { requireHousehold } from '@/lib/household';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { BatchUploadClient } from './BatchUploadClient';
import { formatDate } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function BatchPage() {
  const household = await requireHousehold();
  const supabase = await createSupabaseServerClient();
  const { data: batches } = await supabase
    .from('batch_uploads')
    .select('id, status, detected_count, created_at, source_image_url')
    .eq('household_id', household.id)
    .order('created_at', { ascending: false })
    .limit(10);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Batch capture</h1>
      <p className="text-brand-200">
        Take one photo of a shelf, drawer, or room and the AI will identify each distinct item with a bounding
        box. Drafts are created in <code>review</code> status; you can confirm, edit, or reject each one.
      </p>

      <BatchUploadClient />

      {batches && batches.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-medium">Recent batches</h2>
          <ul className="card divide-y divide-brand-800">
            {batches.map((b) => (
              <li key={b.id} className="p-3 flex items-center gap-3">
                <img src={b.source_image_url} alt="" className="w-14 h-14 object-cover rounded" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm">
                    {b.detected_count} items detected • {b.status}
                  </div>
                  <div className="text-xs text-brand-400">{formatDate(b.created_at)}</div>
                </div>
                <Link href={`/batch/${b.id}`} className="btn-secondary">Review</Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
