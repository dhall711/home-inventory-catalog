import { NextResponse } from 'next/server';
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { requireHousehold, requireUser } from '@/lib/household';
import { seedDemo } from '@/lib/seedDemo';

export const runtime = 'nodejs';
// Seeding does ~25 item inserts plus child rows; usually <5s but give it
// headroom on cold starts.
export const maxDuration = 60;

/**
 * Seed the calling user's active household with demo inventory data.
 * Owner-only. Optional `{ reset: true }` wipes existing items/tags/
 * collections/locations first.
 *
 * Mirrors scripts/seed-demo.ts so the same data is available whether you
 * run from the CLI or click the button on /settings.
 */
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const household = await requireHousehold();

    let body: { reset?: boolean } = {};
    try {
      body = (await req.json()) as { reset?: boolean };
    } catch {
      // empty body is fine
    }

    const supabase = await createSupabaseServerClient();
    const { data: membership } = await supabase
      .from('household_members')
      .select('role')
      .eq('household_id', household.id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (!membership || membership.role !== 'owner') {
      return NextResponse.json(
        { error: 'Only the household owner can seed demo data.' },
        { status: 403 }
      );
    }

    const admin = createSupabaseServiceRoleClient();
    const result = await seedDemo({
      admin,
      householdId: household.id,
      reset: body.reset === true,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Seed failed';
    console.error('[api/admin/seed-demo] failed:', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
