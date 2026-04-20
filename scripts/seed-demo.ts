/**
 * ============================================================================
 * [TESTING ONLY - REMOVE BEFORE PRODUCTION]
 * ============================================================================
 * Delete this script and the matching `seed:demo` entry in package.json.
 * See BACKLOG.md > "Pre-production cleanup" for the full removal checklist.
 * ============================================================================
 *
 * Seed a realistic demo household so screenshots/demos/reports look populated.
 *
 * Usage:
 *   npx tsx scripts/seed-demo.ts --household <id>           # seed into an existing household
 *   npx tsx scripts/seed-demo.ts --household <id> --reset   # wipe data first, then seed
 *
 * Env required:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Note: the actual seed data lives in lib/seedDemo.ts so the same data is
 * inserted whether you run this CLI script or click "Seed demo data" on
 * the in-app /settings page.
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { argv, exit } from 'node:process';
import { seedDemo } from '../lib/seedDemo';

loadDotEnv();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

async function main() {
  const args = parseArgs(argv.slice(2));
  if (!args.household) {
    console.error('usage: seed-demo.ts --household <id> [--reset]');
    exit(1);
  }

  const { data: hh, error: hhErr } = await admin
    .from('households')
    .select('id, name')
    .eq('id', args.household)
    .maybeSingle();
  if (hhErr || !hh) {
    console.error(`Household ${args.household} not found.`);
    exit(1);
  }
  console.log(`Seeding household "${hh.name}" (${hh.id})`);

  if (args.reset) {
    console.log('Resetting existing data first...');
  }

  const result = await seedDemo({
    admin,
    householdId: hh.id,
    reset: args.reset === true,
  });

  console.log(`  ${result.locations} locations ready`);
  console.log(`  ${result.collections} collections ready`);
  console.log(`  ${result.tags} tags ready`);
  console.log(`  ${result.inserted}/${result.attempted} items inserted`);
  if (result.errors.length > 0) {
    console.log(`  ${result.errors.length} errors:`);
    for (const e of result.errors) console.log(`    - ${e}`);
  }
  console.log('\nDone seeding demo data.');
}

interface CliArgs { household?: string; reset?: boolean; }
function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--household') args.household = argv[++i];
    else if (a === '--reset') args.reset = true;
  }
  return args;
}

function loadDotEnv() {
  const path = join(process.cwd(), '.env.local');
  if (!existsSync(path)) return;
  const content = readFileSync(path, 'utf8');
  for (const line of content.split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!process.env[m[1]]) process.env[m[1]] = v;
  }
}

main().catch((err) => {
  console.error(err);
  exit(1);
});
