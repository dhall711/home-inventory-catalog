/**
 * Chat assistant types. We mirror Anthropic's content-block shapes so we
 * can persist them to chat_messages.content_blocks and round-trip the
 * conversation back into the API verbatim.
 */

export type ChatRole = 'user' | 'assistant';

export interface ChatTextBlock {
  type: 'text';
  text: string;
}

export interface ChatImageBlock {
  type: 'image';
  source:
    | { type: 'base64'; media_type: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'; data: string }
    | { type: 'url'; url: string };
}

export interface ChatToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ChatToolResultBlock {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

export type ChatContentBlock =
  | ChatTextBlock
  | ChatImageBlock
  | ChatToolUseBlock
  | ChatToolResultBlock;

export interface ChatMessageRow {
  id: string;
  conversation_id: string;
  role: ChatRole;
  content_blocks: ChatContentBlock[];
  image_url: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  created_at: string;
}

export interface ChatConversationRow {
  id: string;
  household_id: string;
  created_by: string;
  title: string | null;
  last_message_at: string | null;
  message_count: number;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export type ChatActionStatus =
  | 'proposed'
  | 'approved'
  | 'rejected'
  | 'applied'
  | 'failed';

export interface ChatActionRow {
  id: string;
  conversation_id: string;
  message_id: string;
  tool_use_id: string;
  tool_name: string;
  tool_input: Record<string, unknown>;
  status: ChatActionStatus;
  result: unknown;
  error_text: string | null;
  proposed_at: string;
  decided_at: string | null;
  decided_by: string | null;
  applied_at: string | null;
}

/**
 * Marker we ask the agent to use whenever it mentions an inventory item:
 *   [[Display Name|<item_id>]]
 * The chat message renderer turns these into Next.js Links to /items/[id].
 * Same convention the wine app's chat used.
 */
export const ITEM_LINK_REGEX = /\[\[([^\]|]+)\|([^\]]+)\]\]/g;
