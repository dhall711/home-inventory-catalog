import { redirect } from 'next/navigation';
import { requireHousehold } from '@/lib/household';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function NewChatPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const sp = await searchParams;
  const household = await requireHousehold();
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user;
  if (!user) redirect('/login');

  const { data: created } = await supabase
    .from('chat_conversations')
    .insert({
      household_id: household.id,
      created_by: user.id,
      title: sp.q ? sp.q.slice(0, 60) : 'New chat',
    })
    .select('id')
    .single();

  if (created?.id) {
    const dest = sp.q
      ? `/chat/${created.id}?q=${encodeURIComponent(sp.q)}`
      : `/chat/${created.id}`;
    redirect(dest);
  }
  redirect('/');
}
