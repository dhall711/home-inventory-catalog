import { NextResponse } from 'next/server';
import { requireHousehold } from '@/lib/household';
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { ATTACHMENT_BUCKET } from '@/lib/storage';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const household = await requireHousehold();
  const supabase = await createSupabaseServerClient();
  const { data: att } = await supabase
    .from('item_attachments')
    .select('id, url, item_id, items!inner(household_id)')
    .eq('id', id)
    .single();
  if (!att) return NextResponse.json({ error: 'not found' }, { status: 404 });
  // RLS already enforces this, but double check
  const householdId = (att as unknown as { items: { household_id: string } }).items.household_id;
  if (householdId !== household.id) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const supa = createSupabaseServiceRoleClient();
  const { data: signed } = await supa.storage.from(ATTACHMENT_BUCKET).createSignedUrl(att.url, 3600);
  return NextResponse.json({ url: signed?.signedUrl ?? null });
}
