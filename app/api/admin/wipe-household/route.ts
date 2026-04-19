import { NextResponse } from 'next/server';
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { requireHousehold, requireUser } from '@/lib/household';

const ITEM_ATTRIBUTE_TABLES = [
  'item_attributes_art',
  'item_attributes_electronics',
  'item_attributes_jewelry',
  'item_attributes_furniture',
  'item_attributes_watches',
  'item_attributes_collectibles',
  'item_attributes_figurines',
  'item_attributes_ethnographic_art',
  'item_attributes_decorative_arts',
  'item_attributes_pipes',
  'item_attributes_musical_instruments',
  'item_attributes_coins_currency',
  'item_attributes_stamps',
  'item_attributes_firearms',
  'item_attributes_wine_spirits',
];

const PHOTO_BUCKET = 'item-photos';
const ATTACHMENT_BUCKET = 'item-attachments';
const REPORTS_BUCKET = 'reports';

/**
 * Wipes ALL inventory data for the calling user's active household.
 * Requires owner role and a typed confirmation matching the household name.
 */
export async function POST(req: Request) {
  const user = await requireUser();
  const household = await requireHousehold();

  let body: { confirm?: string } = {};
  try {
    body = (await req.json()) as { confirm?: string };
  } catch {}

  if (!body.confirm || body.confirm !== household.name) {
    return NextResponse.json(
      { error: 'Confirmation text does not match the household name.' },
      { status: 400 }
    );
  }

  // Verify the caller is an owner of this household.
  const supabase = await createSupabaseServerClient();
  const { data: membership } = await supabase
    .from('household_members')
    .select('role')
    .eq('household_id', household.id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (!membership || membership.role !== 'owner') {
    return NextResponse.json(
      { error: 'Only the household owner can wipe all data.' },
      { status: 403 }
    );
  }

  const admin = createSupabaseServiceRoleClient();

  // 1) collect item ids for child cleanups + storage paths
  const { data: items } = await admin.from('items').select('id').eq('household_id', household.id);
  const itemIds = (items ?? []).map((r: { id: string }) => r.id);

  if (itemIds.length > 0) {
    const { data: attachments } = await admin
      .from('item_attachments')
      .select('storage_path')
      .in('item_id', itemIds);
    const attachmentPaths = (attachments ?? [])
      .map((r: { storage_path: string | null }) => r.storage_path)
      .filter((p): p is string => !!p);
    if (attachmentPaths.length > 0) {
      await removeInChunks(admin, ATTACHMENT_BUCKET, attachmentPaths);
    }
  }

  const { data: reports } = await admin
    .from('reports')
    .select('pdf_url, csv_url')
    .eq('household_id', household.id);
  const reportPaths = (reports ?? [])
    .flatMap((r: { pdf_url: string | null; csv_url: string | null }) =>
      [r.pdf_url, r.csv_url].filter((u): u is string => !!u)
    )
    .map(extractObjectPath)
    .filter((p): p is string => !!p);
  if (reportPaths.length > 0) {
    await removeInChunks(admin, REPORTS_BUCKET, reportPaths);
  }

  await removeFolder(admin, PHOTO_BUCKET, household.id);

  // 2) child rows
  if (itemIds.length > 0) {
    await admin.from('value_history').delete().in('item_id', itemIds);
    await admin.from('item_tags').delete().in('item_id', itemIds);
    await admin.from('item_photos').delete().in('item_id', itemIds);
    await admin.from('item_attachments').delete().in('item_id', itemIds);
    for (const t of ITEM_ATTRIBUTE_TABLES) {
      await admin.from(t).delete().in('item_id', itemIds);
    }
  }

  await admin.from('items').delete().eq('household_id', household.id);
  await admin.from('reports').delete().eq('household_id', household.id);
  await admin.from('batch_uploads').delete().eq('household_id', household.id);
  await admin.from('tags').delete().eq('household_id', household.id);
  await admin.from('collections').delete().eq('household_id', household.id);
  await admin.from('locations').delete().eq('household_id', household.id);

  return NextResponse.json({ ok: true, deleted_items: itemIds.length });
}

type AdminClient = ReturnType<typeof createSupabaseServiceRoleClient>;

async function removeInChunks(client: AdminClient, bucket: string, paths: string[]) {
  const size = 100;
  for (let i = 0; i < paths.length; i += size) {
    await client.storage.from(bucket).remove(paths.slice(i, i + size));
  }
}

async function removeFolder(client: AdminClient, bucket: string, folder: string) {
  const { data: files } = await client.storage.from(bucket).list(folder, { limit: 1000 });
  if (!files || files.length === 0) return;
  await removeInChunks(client, bucket, files.map((f) => `${folder}/${f.name}`));
}

function extractObjectPath(url: string): string | null {
  const m = url.match(/\/storage\/v1\/object\/(?:public|sign)\/[^/]+\/(.+?)(?:\?|$)/);
  if (!m) return null;
  return decodeURIComponent(m[1]);
}
