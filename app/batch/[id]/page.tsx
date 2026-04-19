import { notFound } from 'next/navigation';
import { requireHousehold } from '@/lib/household';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { BatchReviewClient } from './BatchReviewClient';
import type { BoundingBox, Item } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function BatchReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const household = await requireHousehold();
  const supabase = await createSupabaseServerClient();

  const { data: batch } = await supabase
    .from('batch_uploads')
    .select('*')
    .eq('household_id', household.id)
    .eq('id', id)
    .single();
  if (!batch) notFound();

  const { data: photos } = await supabase
    .from('item_photos')
    .select('item_id, bbox_json')
    .eq('source_batch_id', id);

  const itemIds = (photos ?? []).map((p) => p.item_id);
  const { data: items } = itemIds.length
    ? await supabase.from('items').select('*').in('id', itemIds)
    : { data: [] as Item[] };

  const detections = (photos ?? []).map((p) => ({
    item: (items ?? []).find((it) => it.id === p.item_id) as Item,
    bbox: p.bbox_json as BoundingBox | null,
  })).filter((d) => d.item);

  return (
    <BatchReviewClient
      batchId={id}
      sourceImageUrl={batch.source_image_url}
      detections={detections}
    />
  );
}
