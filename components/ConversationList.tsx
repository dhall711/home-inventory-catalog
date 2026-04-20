'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ChatConversationRow } from '@/lib/chat/types';

interface Props {
  conversations: ChatConversationRow[];
  activeId: string | null;
}

export function ConversationList({ conversations, activeId }: Props) {
  const router = useRouter();

  async function startNew() {
    const res = await fetch('/api/chat/conversations', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    const data = await res.json();
    if (data?.conversation?.id) router.push(`/chat/${data.conversation.id}`);
  }

  async function deleteConv(id: string, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm('Delete this conversation? This cannot be undone.')) return;
    await fetch(`/api/chat/conversations/${id}`, { method: 'DELETE' });
    if (activeId === id) router.push('/chat');
    else router.refresh();
  }

  async function renameConv(id: string, currentTitle: string | null, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const next = window.prompt('Rename conversation:', currentTitle ?? '');
    if (next === null) return;
    await fetch(`/api/chat/conversations/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: next }),
    });
    router.refresh();
  }

  return (
    <aside className="border-r border-brand-800 w-64 flex-shrink-0 flex flex-col">
      <div className="p-3 border-b border-brand-800">
        <button type="button" onClick={startNew} className="btn-primary w-full text-sm">
          + New chat
        </button>
      </div>
      <nav className="flex-1 overflow-y-auto p-2 space-y-1">
        {conversations.length === 0 && (
          <p className="text-xs text-brand-500 text-center mt-4">No conversations yet.</p>
        )}
        {conversations.map((c) => {
          const isActive = c.id === activeId;
          return (
            <Link
              key={c.id}
              href={`/chat/${c.id}`}
              className={`group flex items-center gap-2 px-2 py-2 rounded text-sm ${
                isActive ? 'bg-brand-700/60 text-white' : 'hover:bg-brand-800/60 text-brand-200'
              }`}
            >
              <div className="flex-1 min-w-0">
                <div className="truncate">{c.title || 'Untitled chat'}</div>
                <div className="text-[10px] text-brand-500">
                  {c.last_message_at ? new Date(c.last_message_at).toLocaleString() : 'Just now'}
                  {' · '}
                  {c.message_count} msg{c.message_count === 1 ? '' : 's'}
                </div>
              </div>
              <span className="opacity-0 group-hover:opacity-100 flex items-center">
                <button
                  type="button"
                  onClick={(e) => renameConv(c.id, c.title, e)}
                  className="text-brand-400 hover:text-brand-100 px-1 text-xs"
                  title="Rename"
                  aria-label="Rename conversation"
                >
                  ✎
                </button>
                <button
                  type="button"
                  onClick={(e) => deleteConv(c.id, e)}
                  className="text-brand-400 hover:text-red-300 px-1"
                  title="Delete"
                  aria-label="Delete conversation"
                >
                  ×
                </button>
              </span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
