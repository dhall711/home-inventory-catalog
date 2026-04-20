'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ChatPanel } from './ChatPanel';

const ACTIVE_KEY = 'chat:active_conversation_id';

/**
 * Floating chat bubble that lives at the bottom-right of every page (when
 * mounted inside AppShell). Click expands a 380x560 panel with the same
 * ChatPanel used by /chat. Remembers the active conversation in
 * localStorage so the conversation persists across navigations.
 *
 * On mobile we expand to fullscreen. On the dedicated /chat route we hide
 * the widget entirely (the page already shows the full UI).
 */
export function ChatWidget() {
  const pathname = usePathname() ?? '';
  const [open, setOpen] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  // Load active conversation from localStorage on mount.
  useEffect(() => {
    setConversationId(window.localStorage.getItem(ACTIVE_KEY));
    setHydrated(true);
  }, []);

  // Don't render on /chat itself - it already owns the UI.
  if (pathname.startsWith('/chat') || pathname.startsWith('/login') || pathname.startsWith('/auth')) {
    return null;
  }

  function handleConversationCreated(id: string) {
    setConversationId(id);
    window.localStorage.setItem(ACTIVE_KEY, id);
  }

  function handleNewChat() {
    setConversationId(null);
    window.localStorage.removeItem(ACTIVE_KEY);
  }

  if (!hydrated) return null;

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open chat assistant"
          className="fixed bottom-4 right-4 z-40 w-14 h-14 rounded-full bg-brand-600 hover:bg-brand-500 text-white shadow-lg shadow-black/40 flex items-center justify-center transition-transform hover:scale-105"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </button>
      )}

      {open && (
        <div
          className="
            fixed z-50 bg-brand-950 border border-brand-800 rounded-lg shadow-2xl shadow-black/60 overflow-hidden flex flex-col
            inset-0 sm:inset-auto sm:bottom-4 sm:right-4 sm:w-[380px] sm:h-[560px] sm:max-h-[calc(100vh-2rem)]
          "
        >
          <header className="flex items-center justify-between px-3 py-2 border-b border-brand-800 bg-brand-900/60">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-7 h-7 rounded-full bg-brand-700 flex items-center justify-center text-white text-xs">AI</div>
              <span className="font-semibold text-sm truncate">Inventory assistant</span>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handleNewChat}
                className="text-xs text-brand-300 hover:text-white px-2 py-1"
                title="Start a new chat"
              >
                + New
              </button>
              <Link
                href={conversationId ? `/chat/${conversationId}` : '/chat'}
                className="text-xs text-brand-300 hover:text-white px-2 py-1"
                title="Open full chat"
              >
                ↗
              </Link>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-brand-300 hover:text-white px-2 leading-none text-xl"
                aria-label="Close chat"
              >
                ×
              </button>
            </div>
          </header>
          <div className="flex-1 min-h-0">
            <ChatPanel
              conversationId={conversationId}
              onConversationCreated={handleConversationCreated}
              compact
              starterPrompts={[
                'What is my most valuable item?',
                'Which items are missing photos?',
                'Summarize my collections',
              ]}
            />
          </div>
        </div>
      )}
    </>
  );
}
