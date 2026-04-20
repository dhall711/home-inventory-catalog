import { NextResponse } from 'next/server';
import { requireHousehold } from '@/lib/household';
import {
  createSupabaseServerClient,
  createSupabaseServiceRoleClient,
} from '@/lib/supabase/server';
import { resumeAfterActions } from '@/lib/chat/agent';
import { TOOLS_BY_NAME } from '@/lib/chat/tools';
import type { ChatActionRow } from '@/lib/chat/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/chat/actions/[id]
 * Body: { decision: 'approve' | 'reject' }
 *
 * Approve:
 *   - Marks the action approved.
 *   - Executes the corresponding write tool handler against the
 *     authenticated user's RLS-scoped Supabase client (so the user's own
 *     permissions still gate the mutation).
 *   - Updates the action to 'applied' (or 'failed' on error) with the
 *     handler's return value as `result`.
 *
 * After the LAST sibling action on the same paused assistant message has
 * been decided (approved or rejected), we resume the agent loop so it can
 * react to the result(s).
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 });
  }

  const { id } = await ctx.params;
  const household = await requireHousehold();
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user;
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const body = (await req.json()) as { decision?: 'approve' | 'reject' };
  if (body.decision !== 'approve' && body.decision !== 'reject') {
    return NextResponse.json({ error: 'decision must be "approve" or "reject"' }, { status: 400 });
  }

  const admin = createSupabaseServiceRoleClient();

  // Load + verify the action belongs to this household via its conversation.
  const { data: action } = await admin
    .from('chat_actions')
    .select('*, chat_conversations!inner(household_id)')
    .eq('id', id)
    .single();
  if (!action || (action as { chat_conversations: { household_id: string } }).chat_conversations.household_id !== household.id) {
    return NextResponse.json({ error: 'Action not found' }, { status: 404 });
  }
  const row = action as unknown as ChatActionRow & { chat_conversations: { household_id: string } };
  if (row.status !== 'proposed') {
    return NextResponse.json({ error: `Action already ${row.status}` }, { status: 409 });
  }

  if (body.decision === 'reject') {
    await admin
      .from('chat_actions')
      .update({
        status: 'rejected',
        decided_at: new Date().toISOString(),
        decided_by: user.id,
      })
      .eq('id', id);
  } else {
    // Approve + execute.
    const tool = TOOLS_BY_NAME[row.tool_name];
    if (!tool || !tool.isWrite) {
      await admin
        .from('chat_actions')
        .update({
          status: 'failed',
          decided_at: new Date().toISOString(),
          decided_by: user.id,
          error_text: `Unknown or non-write tool: ${row.tool_name}`,
        })
        .eq('id', id);
      return NextResponse.json({ error: 'Unknown tool' }, { status: 400 });
    }

    await admin
      .from('chat_actions')
      .update({
        status: 'approved',
        decided_at: new Date().toISOString(),
        decided_by: user.id,
      })
      .eq('id', id);

    let result: unknown = null;
    let errText: string | null = null;
    try {
      result = await tool.handler(row.tool_input ?? {}, {
        householdId: household.id,
        userId: user.id,
        supabase,
      });
    } catch (e) {
      errText = (e as Error).message ?? 'Tool execution failed';
    }

    await admin
      .from('chat_actions')
      .update({
        status: errText ? 'failed' : 'applied',
        applied_at: new Date().toISOString(),
        result: errText ? null : (result as object | null),
        error_text: errText,
      })
      .eq('id', id);
  }

  // If all sibling actions on this paused assistant message are decided,
  // resume the agent loop so it can speak to the result.
  const { data: siblings } = await admin
    .from('chat_actions')
    .select('status')
    .eq('message_id', row.message_id);
  const stillPending = (siblings ?? []).some((s) => s.status === 'proposed');

  if (stillPending) {
    return NextResponse.json({ ok: true, resumed: false });
  }

  // Item count for system prompt.
  const { count: itemCount } = await admin
    .from('items')
    .select('id', { count: 'exact', head: true })
    .eq('household_id', household.id);

  const resumeResult = await resumeAfterActions(
    {
      conversationId: row.conversation_id,
      householdId: household.id,
      userId: user.id,
      supabase,
      admin,
      householdName: household.name,
      itemCount: itemCount ?? 0,
    },
    row.message_id
  );

  return NextResponse.json({
    ok: true,
    resumed: true,
    new_messages: resumeResult.newMessages,
    pending_actions: resumeResult.pendingActions,
    completed: resumeResult.completed,
  });
}
