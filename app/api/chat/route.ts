import { NextResponse } from 'next/server';
import { requireHousehold } from '@/lib/household';
import {
  createSupabaseServerClient,
  createSupabaseServiceRoleClient,
} from '@/lib/supabase/server';
import { runAgentTurn } from '@/lib/chat/agent';
import type { ChatContentBlock } from '@/lib/chat/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/chat
 * Body: { conversation_id?: string, message?: string, image_url?: string,
 *         image_data?: string }
 * If conversation_id is omitted we create a new conversation first.
 * Returns: { conversation_id, new_messages, pending_actions, completed }
 */
export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: 'AI chat is not configured. Add ANTHROPIC_API_KEY to your env.' },
      { status: 500 }
    );
  }

  const household = await requireHousehold();
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user;
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const body = (await req.json()) as {
    conversation_id?: string;
    message?: string;
    image_url?: string;
    image_data?: string;
  };

  const message = (body.message ?? '').trim();
  const hasImage = !!(body.image_url || body.image_data);
  if (!message && !hasImage) {
    return NextResponse.json({ error: 'message or image required' }, { status: 400 });
  }

  // Resolve or create the conversation. We use the user-scoped client for
  // the create so RLS enforces created_by = auth.uid() automatically.
  let conversationId = body.conversation_id ?? '';
  if (conversationId) {
    const { data: existing } = await supabase
      .from('chat_conversations')
      .select('id, message_count')
      .eq('id', conversationId)
      .eq('household_id', household.id)
      .single();
    if (!existing) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }
    // Soft cap to keep token costs bounded. The user can start a fresh
    // conversation with "+ New chat" for new topics. Tunable via env.
    const cap = Number(process.env.CHAT_MAX_MESSAGES_PER_CONVERSATION ?? 100);
    if ((existing.message_count ?? 0) >= cap) {
      return NextResponse.json(
        {
          error: `This conversation is at its ${cap}-message cap. Start a new chat to continue.`,
        },
        { status: 429 }
      );
    }
  } else {
    const { data: created, error } = await supabase
      .from('chat_conversations')
      .insert({
        household_id: household.id,
        created_by: user.id,
        // Title is filled in below from the first message.
        title: message ? message.slice(0, 60) : 'New chat',
      })
      .select('id')
      .single();
    if (error || !created) {
      return NextResponse.json({ error: error?.message ?? 'create failed' }, { status: 400 });
    }
    conversationId = created.id;
  }

  // Build the user message blocks. If an image is provided we include it
  // INLINE in the API call so vision works on the very first turn; we ALSO
  // store the public/signed URL on the message row so the UI can render
  // it without re-downloading the base64 payload.
  const userBlocks: ChatContentBlock[] = [];
  let imageUrlForRow: string | null = null;
  if (body.image_data) {
    const m = body.image_data.match(/^data:([^;]+);base64,(.+)$/);
    if (!m) return NextResponse.json({ error: 'Invalid image_data' }, { status: 400 });
    userBlocks.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: m[1] as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
        data: m[2],
      },
    });
  } else if (body.image_url) {
    userBlocks.push({ type: 'image', source: { type: 'url', url: body.image_url } });
    imageUrlForRow = body.image_url;
  }
  if (message) userBlocks.push({ type: 'text', text: message });

  // For agent persistence + cross-table writes we use the service role.
  // Tool handlers continue to use the user-scoped client so RLS still
  // enforces household isolation on the data they touch.
  const admin = createSupabaseServiceRoleClient();

  // Item count for system prompt (cheap head-only count).
  const { count: itemCount } = await admin
    .from('items')
    .select('id', { count: 'exact', head: true })
    .eq('household_id', household.id);

  const result = await runAgentTurn(
    {
      conversationId,
      householdId: household.id,
      userId: user.id,
      supabase, // user-scoped client for tool handlers
      admin,
      householdName: household.name,
      itemCount: itemCount ?? 0,
    },
    userBlocks,
    imageUrlForRow
  );

  return NextResponse.json({
    conversation_id: conversationId,
    new_messages: result.newMessages,
    pending_actions: result.pendingActions,
    completed: result.completed,
    truncated: result.truncated,
  });
}
