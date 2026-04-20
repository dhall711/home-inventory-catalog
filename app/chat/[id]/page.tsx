import { notFound } from 'next/navigation';
import { requireHousehold } from '@/lib/household';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { ConversationList } from '@/components/ConversationList';
import { ChatPanel } from '@/components/ChatPanel';
import type { ChatConversationRow } from '@/lib/chat/types';

export const dynamic = 'force-dynamic';

export default async function ChatThreadPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const household = await requireHousehold();
  const supabase = await createSupabaseServerClient();

  const { data: conversation } = await supabase
    .from('chat_conversations')
    .select('*')
    .eq('id', id)
    .eq('household_id', household.id)
    .maybeSingle();

  if (!conversation) notFound();

  const { data: conversations } = await supabase
    .from('chat_conversations')
    .select('*')
    .eq('household_id', household.id)
    .is('archived_at', null)
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(100);

  const starterPrompts = [
    'What is my most valuable item?',
    'How is my inventory broken down by category?',
    'Which items are missing photos or values?',
    'Summarize my collections.',
  ];

  return (
    <div className="-my-6 -mx-4 lg:-mx-6 h-[calc(100vh-4rem)] flex bg-brand-950">
      <ConversationList
        conversations={(conversations ?? []) as ChatConversationRow[]}
        activeId={id}
      />
      <div className="flex-1 min-w-0">
        <ChatPanel conversationId={id} starterPrompts={starterPrompts} autoSend={sp.q} />
      </div>
    </div>
  );
}
