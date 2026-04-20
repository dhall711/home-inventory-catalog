import { redirect } from 'next/navigation';
import { requireHousehold } from '@/lib/household';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * Land at the most recent active conversation. If the user has none yet,
 * /chat/new will create one and redirect.
 */
export default async function ChatIndexPage() {
  const household = await requireHousehold();
  const supabase = await createSupabaseServerClient();

  const { data: latest } = await supabase
    .from('chat_conversations')
    .select('id')
    .eq('household_id', household.id)
    .is('archived_at', null)
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latest?.id) redirect(`/chat/${latest.id}`);
  redirect('/chat/new');
}
