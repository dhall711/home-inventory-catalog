import { NextResponse } from 'next/server';
import { requireHousehold } from '@/lib/household';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const household = await requireHousehold();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('chat_conversations')
    .select('*')
    .eq('household_id', household.id)
    .is('archived_at', null)
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ conversations: data ?? [] });
}

export async function POST(req: Request) {
  const household = await requireHousehold();
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user;
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { title?: string };
  const { data, error } = await supabase
    .from('chat_conversations')
    .insert({
      household_id: household.id,
      created_by: user.id,
      title: body.title?.trim() || null,
    })
    .select('*')
    .single();
  if (error || !data) return NextResponse.json({ error: error?.message }, { status: 400 });
  return NextResponse.json({ conversation: data }, { status: 201 });
}
