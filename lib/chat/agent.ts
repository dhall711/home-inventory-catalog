import type { SupabaseClient } from '@supabase/supabase-js';
import type Anthropic from '@anthropic-ai/sdk';
import { anthropic, VISION_MODEL } from '@/lib/ai';
import { CATEGORIES } from '@/lib/types';
import {
  TOOLS_BY_NAME,
  toolsForApi,
  type ToolContext,
} from '@/lib/chat/tools';
import type {
  ChatActionRow,
  ChatContentBlock,
  ChatMessageRow,
  ChatToolUseBlock,
} from '@/lib/chat/types';

/**
 * Maximum agent loop iterations per user turn. Each hop is one round-trip
 * to Claude. We cap to prevent runaway tool-calling. 8 has been plenty in
 * practice; raise if real usage hits the cap.
 */
const MAX_HOPS = 8;

/**
 * Optional override - lets us run the chat agent on a cheaper/faster
 * model than the vision pipeline. Defaults to whatever VISION_MODEL is.
 */
export const CHAT_MODEL = process.env.ANTHROPIC_CHAT_MODEL || VISION_MODEL;

export interface AgentRunContext extends ToolContext {
  conversationId: string;
  /** Service-role client for persisting messages + actions (bypasses RLS). */
  admin: SupabaseClient;
  householdName: string;
  itemCount: number;
}

export interface AgentRunResult {
  /**
   * The new messages persisted during this turn (in chronological order).
   * The client merges these into the existing thread.
   */
  newMessages: ChatMessageRow[];
  /**
   * Pending write actions awaiting user approval. When non-empty, the
   * agent loop has paused; the client must render approval UI and POST
   * to /api/chat/actions/[id] with a decision.
   */
  pendingActions: ChatActionRow[];
  /** True when the loop ran to completion without a pending action. */
  completed: boolean;
  /** True when the MAX_HOPS guard tripped. */
  truncated: boolean;
}

/**
 * Build the system prompt for the agent. We deliberately keep this short
 * and give the agent tools to discover everything else; stuffing the
 * inventory into the prompt does not scale to thousands of items.
 */
function buildSystemPrompt(args: { householdName: string; itemCount: number }) {
  const categoryList = CATEGORIES.map((c) => `${c.slug} (${c.name})`).join(', ');
  return `You are the AI assistant for the "${args.householdName}" home inventory catalog.
There are currently ${args.itemCount} items catalogued.

Your job is to help the user explore, understand, and manage their inventory.
You can answer questions, summarize collections, identify objects from photos,
estimate values, and (when write tools are enabled) propose changes.

INVENTORY MODEL
- Items belong to a single category, optionally a location (e.g. "Living room"),
  and optionally a collection (e.g. "Lladro figurines").
- Items can have free-form tags.
- Categories: ${categoryList}.

TOOL USAGE
- Use the search_items tool aggressively. The catalog can have thousands of
  items; never assume you know its contents. When the user mentions ANY
  specific item, search for it first to verify it exists.
- get_stats answers portfolio-level questions ("how much is my collection
  worth?", "what is my biggest category?").
- get_item gives you photos, attributes, and value history for one item.
- analyze_photo identifies an unknown object the user has attached.

ANSWER STYLE
- Be conversational but concise. Bullet points and short paragraphs.
- When you mention a specific inventory item, format it as a clickable link
  using EXACTLY this format: [[Display Name|<item_id>]]
  Example: "Your most valuable piece is [[Castello Banfi Brunello 2018|abc-123]]."
  The item_id MUST be the id field from search_items / get_item results.
- If the user asks about something not in the inventory, say so clearly
  before offering general knowledge.
- For value/appraisal questions: be conservative and explain reasoning.
  Note that estimates are not formal appraisals.
- If a question is outside the scope of household inventory, gently redirect.`;
}

/**
 * Persist a single message row (using the service role so we don't fight
 * RLS during multi-step server-side flows).
 */
async function insertMessage(
  admin: SupabaseClient,
  conversationId: string,
  role: 'user' | 'assistant',
  contentBlocks: ChatContentBlock[],
  imageUrl: string | null = null,
  usage: { input_tokens?: number; output_tokens?: number } | null = null
): Promise<ChatMessageRow> {
  const { data, error } = await admin
    .from('chat_messages')
    .insert({
      conversation_id: conversationId,
      role,
      content_blocks: contentBlocks,
      image_url: imageUrl,
      input_tokens: usage?.input_tokens ?? null,
      output_tokens: usage?.output_tokens ?? null,
    })
    .select('*')
    .single();
  if (error || !data) throw error ?? new Error('Failed to insert chat message');

  // Bump the conversation pointer so the sidebar can sort and show recency.
  // We do this with a fresh count() rather than +1 to stay correct under any
  // out-of-band deletes.
  const { count } = await admin
    .from('chat_messages')
    .select('id', { count: 'exact', head: true })
    .eq('conversation_id', conversationId);
  await admin
    .from('chat_conversations')
    .update({
      last_message_at: new Date().toISOString(),
      message_count: count ?? 0,
    })
    .eq('id', conversationId);

  return data as ChatMessageRow;
}

async function persistAction(
  admin: SupabaseClient,
  conversationId: string,
  messageId: string,
  block: ChatToolUseBlock
): Promise<ChatActionRow> {
  const { data, error } = await admin
    .from('chat_actions')
    .insert({
      conversation_id: conversationId,
      message_id: messageId,
      tool_use_id: block.id,
      tool_name: block.name,
      tool_input: block.input,
      status: 'proposed',
    })
    .select('*')
    .single();
  if (error || !data) throw error ?? new Error('Failed to insert chat_action');
  return data as ChatActionRow;
}

/**
 * Convert our persisted blocks back into the shape the Anthropic SDK wants.
 * They're already 1:1 by design but we still cast through the SDK types so
 * future schema drift gets a TS error here.
 */
function blocksToApi(blocks: ChatContentBlock[]): Anthropic.ContentBlockParam[] {
  return blocks as unknown as Anthropic.ContentBlockParam[];
}

/**
 * Load the full message history for an Anthropic API call. Rows are
 * returned in chronological order; we map (role, content_blocks) directly
 * into MessageParam[].
 */
async function loadHistoryForApi(
  admin: SupabaseClient,
  conversationId: string
): Promise<Anthropic.MessageParam[]> {
  const { data, error } = await admin
    .from('chat_messages')
    .select('role, content_blocks')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((m) => ({
    role: m.role as 'user' | 'assistant',
    content: blocksToApi((m.content_blocks ?? []) as ChatContentBlock[]),
  }));
}

/**
 * Run one user turn through the agent loop.
 *
 * The user message is persisted first, then we loop:
 *   1. Call Claude with current history + tools.
 *   2. Persist the assistant message.
 *   3. If the response has no tool_use blocks, we're done.
 *   4. For READ tool_use blocks: execute and append a tool_result user message.
 *   5. For WRITE tool_use blocks: stop, persist as a chat_action with
 *      status=proposed, and return for the user to approve/reject.
 */
export async function runAgentTurn(
  ctx: AgentRunContext,
  userBlocks: ChatContentBlock[],
  imageUrl: string | null
): Promise<AgentRunResult> {
  const newMessages: ChatMessageRow[] = [];
  const pendingActions: ChatActionRow[] = [];

  const userMsg = await insertMessage(
    ctx.admin,
    ctx.conversationId,
    'user',
    userBlocks,
    imageUrl
  );
  newMessages.push(userMsg);

  const system = buildSystemPrompt({
    householdName: ctx.householdName,
    itemCount: ctx.itemCount,
  });

  let truncated = false;

  for (let hop = 0; hop < MAX_HOPS; hop++) {
    const messages = await loadHistoryForApi(ctx.admin, ctx.conversationId);

    const response = await anthropic.messages.create({
      model: CHAT_MODEL,
      max_tokens: 2048,
      system,
      tools: toolsForApi(),
      messages,
    });

    const assistantBlocks = response.content as unknown as ChatContentBlock[];
    const assistantMsg = await insertMessage(
      ctx.admin,
      ctx.conversationId,
      'assistant',
      assistantBlocks,
      null,
      { input_tokens: response.usage.input_tokens, output_tokens: response.usage.output_tokens }
    );
    newMessages.push(assistantMsg);

    const toolUses = assistantBlocks.filter(
      (b): b is ChatToolUseBlock => b.type === 'tool_use'
    );

    // No tool calls -> the assistant is done speaking.
    if (toolUses.length === 0 || response.stop_reason === 'end_turn') {
      return { newMessages, pendingActions, completed: true, truncated: false };
    }

    // Split into read (auto-execute) vs write (pause-and-confirm).
    const writes = toolUses.filter((tu) => TOOLS_BY_NAME[tu.name]?.isWrite);
    const reads = toolUses.filter((tu) => !TOOLS_BY_NAME[tu.name]?.isWrite);

    if (writes.length > 0) {
      // Persist each write as a proposed action and stop. We don't append
      // any tool_result blocks - the conversation will resume after the
      // user approves/rejects each pending action via the actions endpoint.
      for (const w of writes) {
        const action = await persistAction(
          ctx.admin,
          ctx.conversationId,
          assistantMsg.id,
          w
        );
        pendingActions.push(action);
      }
      // If reads are mixed in alongside writes, we still need to satisfy
      // them so the conversation isn't malformed. Execute reads and append
      // their results as a separate user message; on resume, the API will
      // see those plus pending tool_results we'll synthesize per-action.
      // For simplicity in v1 we treat the whole assistant turn as paused.
      return { newMessages, pendingActions, completed: false, truncated: false };
    }

    // Pure-read turn: execute and append tool_result blocks as a user msg.
    const toolResultBlocks: ChatContentBlock[] = [];
    for (const tu of reads) {
      const tool = TOOLS_BY_NAME[tu.name];
      let resultText: string;
      let isError = false;
      if (!tool) {
        resultText = JSON.stringify({ error: `Unknown tool: ${tu.name}` });
        isError = true;
      } else {
        try {
          const result = await tool.handler(
            (tu.input ?? {}) as Record<string, unknown>,
            { householdId: ctx.householdId, userId: ctx.userId, supabase: ctx.supabase }
          );
          resultText = JSON.stringify(result);
        } catch (e) {
          resultText = JSON.stringify({ error: (e as Error).message });
          isError = true;
        }
      }
      toolResultBlocks.push({
        type: 'tool_result',
        tool_use_id: tu.id,
        content: resultText,
        is_error: isError,
      });
    }

    const toolResultMsg = await insertMessage(
      ctx.admin,
      ctx.conversationId,
      'user',
      toolResultBlocks,
      null
    );
    newMessages.push(toolResultMsg);

    if (hop === MAX_HOPS - 1) {
      truncated = true;
    }
  }

  return { newMessages, pendingActions, completed: false, truncated };
}

/**
 * Continue a conversation that was paused waiting on user approval.
 *
 * Called by /api/chat/actions/[id] after the LAST pending action for the
 * paused assistant message has been approved or rejected. We synthesize a
 * single user message containing tool_result blocks for every action that
 * was attached to that assistant message, then resume the agent loop the
 * same way runAgentTurn does.
 *
 * Caller is responsible for ensuring all sibling actions on the same
 * message are decided before invoking this; partial resumption would
 * leave dangling tool_use blocks the API rejects.
 */
export async function resumeAfterActions(
  ctx: AgentRunContext,
  messageId: string
): Promise<AgentRunResult> {
  // Pull every action attached to that assistant message - even ones from
  // earlier in this conversation - so we can find the just-decided batch.
  const { data: rows } = await ctx.admin
    .from('chat_actions')
    .select('*')
    .eq('message_id', messageId)
    .order('proposed_at', { ascending: true });
  const siblings = (rows ?? []) as ChatActionRow[];

  // If anything is still proposed, we're not ready to resume.
  if (siblings.some((s) => s.status === 'proposed')) {
    return { newMessages: [], pendingActions: siblings.filter((s) => s.status === 'proposed'), completed: false, truncated: false };
  }

  // Build tool_result blocks: applied -> JSON of result, rejected -> short
  // "User declined this action." with is_error=false (it's not really an
  // error, just a rejection the agent can react to).
  const toolResults: ChatContentBlock[] = siblings.map((s) => {
    if (s.status === 'applied') {
      return {
        type: 'tool_result',
        tool_use_id: s.tool_use_id,
        content: JSON.stringify(s.result ?? { ok: true }),
      };
    }
    if (s.status === 'rejected') {
      return {
        type: 'tool_result',
        tool_use_id: s.tool_use_id,
        content: 'User declined this proposed action.',
        is_error: false,
      };
    }
    // failed
    return {
      type: 'tool_result',
      tool_use_id: s.tool_use_id,
      content: JSON.stringify({ error: s.error_text ?? 'Action failed.' }),
      is_error: true,
    };
  });

  const resumeMsg = await insertMessage(
    ctx.admin,
    ctx.conversationId,
    'user',
    toolResults,
    null
  );

  // Now run the rest of the loop the same way as runAgentTurn.
  const newMessages: ChatMessageRow[] = [resumeMsg];
  const pendingActions: ChatActionRow[] = [];
  const system = buildSystemPrompt({ householdName: ctx.householdName, itemCount: ctx.itemCount });

  let truncated = false;
  for (let hop = 0; hop < MAX_HOPS; hop++) {
    const messages = await loadHistoryForApi(ctx.admin, ctx.conversationId);
    const response = await anthropic.messages.create({
      model: CHAT_MODEL,
      max_tokens: 2048,
      system,
      tools: toolsForApi(),
      messages,
    });
    const assistantBlocks = response.content as unknown as ChatContentBlock[];
    const assistantMsg = await insertMessage(
      ctx.admin,
      ctx.conversationId,
      'assistant',
      assistantBlocks,
      null,
      { input_tokens: response.usage.input_tokens, output_tokens: response.usage.output_tokens }
    );
    newMessages.push(assistantMsg);

    const toolUses = assistantBlocks.filter((b): b is ChatToolUseBlock => b.type === 'tool_use');
    if (toolUses.length === 0 || response.stop_reason === 'end_turn') {
      return { newMessages, pendingActions, completed: true, truncated: false };
    }

    const writes = toolUses.filter((tu) => TOOLS_BY_NAME[tu.name]?.isWrite);
    const reads = toolUses.filter((tu) => !TOOLS_BY_NAME[tu.name]?.isWrite);

    if (writes.length > 0) {
      for (const w of writes) {
        const action = await persistAction(ctx.admin, ctx.conversationId, assistantMsg.id, w);
        pendingActions.push(action);
      }
      return { newMessages, pendingActions, completed: false, truncated: false };
    }

    const blocks: ChatContentBlock[] = [];
    for (const tu of reads) {
      const tool = TOOLS_BY_NAME[tu.name];
      let resultText: string;
      let isError = false;
      if (!tool) {
        resultText = JSON.stringify({ error: `Unknown tool: ${tu.name}` });
        isError = true;
      } else {
        try {
          const result = await tool.handler(
            (tu.input ?? {}) as Record<string, unknown>,
            { householdId: ctx.householdId, userId: ctx.userId, supabase: ctx.supabase }
          );
          resultText = JSON.stringify(result);
        } catch (e) {
          resultText = JSON.stringify({ error: (e as Error).message });
          isError = true;
        }
      }
      blocks.push({ type: 'tool_result', tool_use_id: tu.id, content: resultText, is_error: isError });
    }
    const m = await insertMessage(ctx.admin, ctx.conversationId, 'user', blocks, null);
    newMessages.push(m);
    if (hop === MAX_HOPS - 1) truncated = true;
  }

  return { newMessages, pendingActions, completed: false, truncated };
}
