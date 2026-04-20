import { NextResponse } from 'next/server';
import { requireHousehold } from '@/lib/household';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const household = await requireHousehold();
  const supabase = await createSupabaseServerClient();

  const { data: conversation, error } = await supabase
    .from('chat_conversations')
    .select('*')
    .eq('id', id)
    .eq('household_id', household.id)
    .single();
  if (error || !conversation) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const [{ data: messages }, { data: actions }] = await Promise.all([
    supabase
      .from('chat_messages')
      .select('*')
      .eq('conversation_id', id)
      .order('created_at', { ascending: true }),
    supabase
      .from('chat_actions')
      .select('*')
      .eq('conversation_id', id)
      .order('proposed_at', { ascending: true }),
  ]);

  return NextResponse.json({
    conversation,
    messages: messages ?? [],
    actions: actions ?? [],
  });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const household = await requireHousehold();
  const supabase = await createSupabaseServerClient();
  const body = (await req.json()) as { title?: string };
  const patch: Record<string, unknown> = {};
  if (typeof body.title === 'string') patch.title = body.title.trim() || null;

  const { data, error } = await supabase
    .from('chat_conversations')
    .update(patch)
    .eq('id', id)
    .eq('household_id', household.id)
    .select('*')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ conversation: data });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const household = await requireHousehold();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('chat_conversations')
    .delete()
    .eq('id', id)
    .eq('household_id', household.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
