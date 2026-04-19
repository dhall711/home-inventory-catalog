import { NextResponse } from 'next/server';
import { requireHousehold } from '@/lib/household';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const household = await requireHousehold();
  const supabase = await createSupabaseServerClient();
  const body = (await req.json()) as {
    name?: string;
    query_string?: string;
    icon?: string | null;
    sort_order?: number;
  };
  const patch: Record<string, unknown> = {};
  if (typeof body.name === 'string') patch.name = body.name.trim();
  if (typeof body.query_string === 'string') {
    patch.query_string = body.query_string.startsWith('?')
      ? body.query_string.slice(1)
      : body.query_string;
  }
  if (body.icon !== undefined) patch.icon = body.icon;
  if (typeof body.sort_order === 'number') patch.sort_order = body.sort_order;

  const { data, error } = await supabase
    .from('saved_searches')
    .update(patch)
    .eq('id', id)
    .eq('household_id', household.id)
    .select('*')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ saved_search: data });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const household = await requireHousehold();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('saved_searches')
    .delete()
    .eq('id', id)
    .eq('household_id', household.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
