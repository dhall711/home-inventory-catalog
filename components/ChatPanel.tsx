'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ChatMessageView } from './ChatMessage';
import { ChatComposer } from './ChatComposer';
import { PendingActionCard } from './PendingActionCard';
import type {
  ChatActionRow,
  ChatConversationRow,
  ChatMessageRow,
} from '@/lib/chat/types';

interface Props {
  conversationId: string | null;
  /**
   * Called when a new message is sent and a fresh conversation gets
   * created server-side. Lets the parent (e.g. the chat widget) update
   * its active-conversation cookie or push to /chat/[id].
   */
  onConversationCreated?: (id: string) => void;
  /** Optional starter prompts shown when the thread is empty. */
  starterPrompts?: string[];
  /** Compact mode hides headings + reduces padding. Used by the widget. */
  compact?: boolean;
  /**
   * If provided AND the conversation is empty, fire this prompt as the
   * very first message after mount. Used by the dashboard "Suggested
   * questions" tiles.
   */
  autoSend?: string;
}

/**
 * Stateful chat thread + composer. Loads existing messages for the given
 * conversation_id (if any), POSTs new ones to /api/chat, and renders
 * pending action cards inline beneath the assistant message that proposed
 * them. Action approve/reject is wired via /api/chat/actions/[id] (added
 * in the write-tools phase; this Phase 1 component renders pending action
 * placeholders that say "Write actions land in a follow-up release.").
 */
export function ChatPanel({
  conversationId,
  onConversationCreated,
  starterPrompts,
  compact,
  autoSend,
}: Props) {
  const [messages, setMessages] = useState<ChatMessageRow[]>([]);
  const [actions, setActions] = useState<ChatActionRow[]>([]);
  const [conversation, setConversation] = useState<ChatConversationRow | null>(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Initial load.
  useEffect(() => {
    let cancelled = false;
    if (!conversationId) {
      setMessages([]);
      setActions([]);
      setConversation(null);
      return;
    }
    setLoading(true);
    fetch(`/api/chat/conversations/${conversationId}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setConversation(data.conversation ?? null);
        setMessages(data.messages ?? []);
        setActions(data.actions ?? []);
      })
      .catch(() => {
        if (!cancelled) setError('Failed to load conversation');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  // Scroll to bottom on message change.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, sending]);

  const send = useCallback(
    async (args: { message: string; imageData?: string }) => {
      setSending(true);
      setError(null);
      try {
        // If the user attached an image, upload it to chat-images first so
        // the message row can store a persistent URL (signed for 1 hour,
        // good enough for the agent's first turn AND for re-rendering
        // history shortly after). We pass image_url to /api/chat so the
        // base64 doesn't have to round-trip through the JSON body.
        let imageUrl: string | undefined;
        if (args.imageData) {
          const blob = await (await fetch(args.imageData)).blob();
          const fd = new FormData();
          fd.append('file', new File([blob], 'chat.jpg', { type: 'image/jpeg' }));
          const upRes = await fetch('/api/chat/upload', { method: 'POST', body: fd });
          const upData = await upRes.json();
          if (!upRes.ok) throw new Error(upData.error ?? 'Image upload failed');
          imageUrl = upData.url as string;
        }

        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            conversation_id: conversationId ?? undefined,
            message: args.message,
            image_url: imageUrl,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? 'Send failed');

        if (!conversationId && data.conversation_id) {
          onConversationCreated?.(data.conversation_id);
        }
        setMessages((prev) => [...prev, ...(data.new_messages ?? [])]);
        setActions((prev) => [...prev, ...(data.pending_actions ?? [])]);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Send failed');
      } finally {
        setSending(false);
      }
    },
    [conversationId, onConversationCreated]
  );

  // Auto-send a starter prompt the first time the panel loads with one.
  // Only fires when the conversation is empty (don't re-send if the user
  // refreshes the page after the message has already gone through).
  const autoSentRef = useRef(false);
  useEffect(() => {
    if (
      autoSend &&
      !autoSentRef.current &&
      !loading &&
      conversationId &&
      messages.length === 0 &&
      !sending
    ) {
      autoSentRef.current = true;
      send({ message: autoSend });
    }
  }, [autoSend, loading, conversationId, messages.length, sending, send]);

  const handleDecided = useCallback(
    (data: { new_messages?: unknown[]; pending_actions?: ChatActionRow[]; resumed: boolean }) => {
      if (data.resumed && data.new_messages) {
        setMessages((prev) => [...prev, ...(data.new_messages as ChatMessageRow[])]);
      }
      // Re-fetch the conversation to pick up the action's new status (and
      // any pending actions that came back).
      if (conversationId) {
        fetch(`/api/chat/conversations/${conversationId}`)
          .then((r) => r.json())
          .then((d) => {
            setActions(d.actions ?? []);
            // The detail endpoint returns canonical messages; only sync if
            // we did NOT already merge resume messages above (avoid dupes).
            if (!data.resumed) setMessages(d.messages ?? []);
          });
      }
    },
    [conversationId]
  );

  const renderAction = (action: ChatActionRow) => (
    <PendingActionCard key={action.id} action={action} onDecided={handleDecided} />
  );

  // Group ALL actions (any status) by the message they belong to so the
  // renderer can show the disposition (proposed/applied/rejected/failed).
  const actionsByMessage = new Map<string, ChatActionRow[]>();
  for (const a of actions) {
    const list = actionsByMessage.get(a.message_id) ?? [];
    list.push(a);
    actionsByMessage.set(a.message_id, list);
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {!compact && conversation && (
        <div className="px-4 py-3 border-b border-brand-800 flex items-center justify-between gap-2">
          <h2 className="font-semibold truncate">{conversation.title ?? 'Untitled chat'}</h2>
          <span className="text-xs text-brand-400">{conversation.message_count} msgs</span>
        </div>
      )}

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
        {loading && <div className="text-sm text-brand-400">Loading...</div>}

        {!loading && messages.length === 0 && (
          <div className="text-center text-brand-300 mt-6 space-y-3">
            <p className="text-base">How can I help with your inventory?</p>
            <p className="text-xs text-brand-500">
              I can search items, summarize collections, identify objects from photos,
              and (soon) help reorganize.
            </p>
            {starterPrompts && starterPrompts.length > 0 && (
              <div className="grid gap-2 pt-2">
                {starterPrompts.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => send({ message: p })}
                    className="text-left text-sm px-3 py-2 rounded border border-brand-800 hover:bg-brand-800/40"
                  >
                    {p}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {messages.map((m) => (
          <ChatMessageView
            key={m.id}
            message={m}
            actions={actionsByMessage.get(m.id)}
            renderAction={renderAction}
          />
        ))}

        {sending && (
          <div className="flex justify-start">
            <div className="bg-brand-900/60 border border-brand-800 rounded-lg px-3 py-2">
              <div className="flex space-x-1">
                <span className="w-1.5 h-1.5 bg-brand-400 rounded-full animate-bounce" />
                <span className="w-1.5 h-1.5 bg-brand-400 rounded-full animate-bounce" style={{ animationDelay: '120ms' }} />
                <span className="w-1.5 h-1.5 bg-brand-400 rounded-full animate-bounce" style={{ animationDelay: '240ms' }} />
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="text-xs text-red-300 border border-red-900/60 bg-red-950/40 rounded p-2">
            {error}
          </div>
        )}
      </div>

      <ChatComposer
        onSend={send}
        disabled={sending || loading}
        placeholder="Ask about your inventory, or attach a photo..."
      />
    </div>
  );
}
