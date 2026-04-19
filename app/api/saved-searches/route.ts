import { NextResponse } from 'next/server';
import { requireHousehold } from '@/lib/household';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const household = await requireHousehold();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('saved_searches')
    .select('*')
    .eq('household_id', household.id)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ saved_searches: data ?? [] });
}

export async function POST(req: Request) {
  const household = await requireHousehold();
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user;
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const body = (await req.json()) as {
    name?: string;
    query_string?: string;
    icon?: string | null;
    sort_order?: number;
  };
  const name = (body.name ?? '').trim();
  const query_string = (body.query_string ?? '').trim();
  if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 });

  // Strip leading "?" so we always store the bare query string.
  const cleanQs = query_string.startsWith('?') ? query_string.slice(1) : query_string;

  const { data, error } = await supabase
    .from('saved_searches')
    .insert({
      household_id: household.id,
      created_by: user.id,
      name,
      query_string: cleanQs,
      icon: body.icon ?? null,
      sort_order: body.sort_order ?? 0,
    })
    .select('*')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ saved_search: data }, { status: 201 });
}
