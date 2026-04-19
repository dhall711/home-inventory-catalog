/**
 * Reset / wipe inventory data for testing & development.
 *
 * Usage:
 *   npx tsx scripts/reset-household.ts --household <id>     # wipe one household's data (keeps household + members)
 *   npx tsx scripts/reset-household.ts --household <id> --drop-household  # also delete the household + members + invites
 *   npx tsx scripts/reset-household.ts --all                # NUKE EVERY HOUSEHOLD'S DATA (dev only, requires --confirm)
 *   npx tsx scripts/reset-household.ts --list               # list all households
 *
 * Env required:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Reads from .env.local automatically if present.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout, argv, exit } from 'node:process';

loadDotEnv();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env / .env.local');
  exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

// ---- Storage buckets that may hold household-scoped files ----
const PHOTO_BUCKET = 'item-photos';
const ATTACHMENT_BUCKET = 'item-attachments';
const REPORTS_BUCKET = 'reports';

// ---- Per-item attribute tables (extend as schema grows) ----
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

async function main() {
  const args = parseArgs(argv.slice(2));

  if (args.list) {
    await listHouseholds();
    return;
  }

  if (args.all) {
    if (process.env.NODE_ENV === 'production' && !args.confirm) {
      console.error('Refusing to --all in production without --confirm');
      exit(1);
    }
    if (!args.yes) {
      const ok = await prompt('Type "WIPE EVERYTHING" to confirm full database wipe: ');
      if (ok.trim() !== 'WIPE EVERYTHING') {
        console.log('Aborted.');
        exit(1);
      }
    }
    const { data: households } = await admin.from('households').select('id, name');
    for (const h of households ?? []) {
      console.log(`\n--- Wiping household ${h.name} (${h.id}) ---`);
      await wipeHousehold(h.id, true);
    }
    console.log('\nDone wiping all households.');
    return;
  }

  if (!args.household) {
    console.error(usage());
    exit(1);
  }

  const { data: hh } = await admin.from('households').select('id, name').eq('id', args.household).maybeSingle();
  if (!hh) {
    console.error(`Household ${args.household} not found.`);
    exit(1);
  }

  if (!args.yes) {
    const verb = args.dropHousehold ? 'DELETE' : 'WIPE';
    const ok = await prompt(
      `Type the household name "${hh.name}" to ${verb} all its data: `
    );
    if (ok.trim() !== hh.name) {
      console.log('Aborted.');
      exit(1);
    }
  }

    await wipeHousehold(hh.id, !!args.dropHousehold);
  console.log(`\nDone. Household "${hh.name}" ${args.dropHousehold ? 'deleted' : 'wiped'}.`);
}

async function listHouseholds() {
  const { data, error } = await admin
    .from('households')
    .select('id, name, created_at')
    .order('created_at', { ascending: true });
  if (error) {
    console.error(error.message);
    exit(1);
  }
  if (!data || data.length === 0) {
    console.log('No households.');
    return;
  }
  console.log(`Found ${data.length} household(s):`);
  for (const h of data) {
    const { count } = await admin
      .from('items')
      .select('id', { count: 'exact', head: true })
      .eq('household_id', h.id);
    console.log(`  ${h.id}  ${h.name.padEnd(40)}  ${count ?? 0} items   created ${h.created_at}`);
  }
}

/**
 * Delete all inventory data for a household. Cascading FKs would delete most
 * row-children automatically when items are deleted, but we walk it manually
 * so we can also wipe the matching Storage objects.
 */
async function wipeHousehold(householdId: string, dropHousehold: boolean) {
  // 1) collect item IDs so we can clean child rows + storage paths
  const { data: items } = await admin.from('items').select('id').eq('household_id', householdId);
  const itemIds = (items ?? []).map((r) => r.id);
  console.log(`  ${itemIds.length} items`);

  // 2) gather attachment + photo storage paths to delete from Storage
  if (itemIds.length > 0) {
    const { data: attachments } = await admin
      .from('item_attachments')
      .select('storage_path')
      .in('item_id', itemIds);
    const attachmentPaths = (attachments ?? [])
      .map((r: { storage_path: string | null }) => r.storage_path)
      .filter((p): p is string => !!p);
    if (attachmentPaths.length > 0) {
      console.log(`  removing ${attachmentPaths.length} attachment file(s) from Storage`);
      await removeInChunks(admin, ATTACHMENT_BUCKET, attachmentPaths);
    }
  }

  // 3) report files
  const { data: reports } = await admin
    .from('reports')
    .select('id, pdf_url, csv_url')
    .eq('household_id', householdId);
  const reportPaths = (reports ?? [])
    .flatMap((r: { pdf_url: string | null; csv_url: string | null }) =>
      [r.pdf_url, r.csv_url].filter((u): u is string => !!u)
    )
    .map(extractObjectPath)
    .filter((p): p is string => !!p);
  if (reportPaths.length > 0) {
    console.log(`  removing ${reportPaths.length} report file(s) from Storage`);
    await removeInChunks(admin, REPORTS_BUCKET, reportPaths);
  }

  // 4) all photo files for this household live under `${householdId}/...`
  await removeFolder(admin, PHOTO_BUCKET, householdId);

  // 5) delete child tables first (some have ON DELETE CASCADE but explicit
  //    ordering keeps things obvious if cascades change)
  if (itemIds.length > 0) {
    await admin.from('value_history').delete().in('item_id', itemIds);
    await admin.from('item_tags').delete().in('item_id', itemIds);
    await admin.from('item_photos').delete().in('item_id', itemIds);
    await admin.from('item_attachments').delete().in('item_id', itemIds);
    for (const t of ITEM_ATTRIBUTE_TABLES) {
      await admin.from(t).delete().in('item_id', itemIds);
    }
  }

  await admin.from('items').delete().eq('household_id', householdId);
  await admin.from('reports').delete().eq('household_id', householdId);
  await admin.from('batch_uploads').delete().eq('household_id', householdId);
  await admin.from('tags').delete().eq('household_id', householdId);
  await admin.from('collections').delete().eq('household_id', householdId);
  await admin.from('locations').delete().eq('household_id', householdId);

  if (dropHousehold) {
    await admin.from('household_invites').delete().eq('household_id', householdId);
    await admin.from('household_members').delete().eq('household_id', householdId);
    await admin.from('households').delete().eq('id', householdId);
  }
}

async function removeInChunks(client: SupabaseClient, bucket: string, paths: string[]) {
  const chunkSize = 100;
  for (let i = 0; i < paths.length; i += chunkSize) {
    const slice = paths.slice(i, i + chunkSize);
    const { error } = await client.storage.from(bucket).remove(slice);
    if (error) console.warn(`  ${bucket} remove warning:`, error.message);
  }
}

async function removeFolder(client: SupabaseClient, bucket: string, folder: string) {
  const { data: files, error } = await client.storage.from(bucket).list(folder, { limit: 1000 });
  if (error) {
    console.warn(`  list ${bucket}/${folder} warning:`, error.message);
    return;
  }
  if (!files || files.length === 0) return;
  const paths = files.map((f) => `${folder}/${f.name}`);
  console.log(`  removing ${paths.length} ${bucket} file(s) from Storage`);
  await removeInChunks(client, bucket, paths);
}

/** Extracts the object path from a Supabase Storage public/signed URL. */
function extractObjectPath(url: string): string | null {
  const m = url.match(/\/storage\/v1\/object\/(?:public|sign)\/[^/]+\/(.+?)(?:\?|$)/);
  if (!m) return null;
  return decodeURIComponent(m[1]);
}

interface CliArgs {
  household?: string;
  all?: boolean;
  list?: boolean;
  yes?: boolean;
  confirm?: boolean;
  dropHousehold?: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--household') args.household = argv[++i];
    else if (a === '--all') args.all = true;
    else if (a === '--list') args.list = true;
    else if (a === '--yes' || a === '-y') args.yes = true;
    else if (a === '--confirm') args.confirm = true;
    else if (a === '--drop-household') args.dropHousehold = true;
  }
  return args;
}

function usage() {
  return `usage:
  reset-household.ts --list
  reset-household.ts --household <id> [--drop-household] [--yes]
  reset-household.ts --all [--confirm] [--yes]`;
}

async function prompt(message: string): Promise<string> {
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    return await rl.question(message);
  } finally {
    rl.close();
  }
}

function loadDotEnv() {
  const path = join(process.cwd(), '.env.local');
  if (!existsSync(path)) return;
  const content = readFileSync(path, 'utf8');
  for (const line of content.split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!m) continue;
    const key = m[1];
    let value = m[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

main().catch((err) => {
  console.error(err);
  exit(1);
});
