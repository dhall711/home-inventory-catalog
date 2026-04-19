import { requireHousehold, requireUser } from '@/lib/household';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { SettingsClient } from './SettingsClient';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const user = await requireUser();
  const household = await requireHousehold();
  const supabase = await createSupabaseServerClient();

  const { data: members } = await supabase
    .from('household_members')
    .select('user_id, role, joined_at, invited_email')
    .eq('household_id', household.id);

  const { data: invites } = await supabase
    .from('household_invites')
    .select('id, email, role, accepted_at, created_at')
    .eq('household_id', household.id)
    .is('accepted_at', null);

  const myRole = members?.find((m) => m.user_id === user.id)?.role ?? 'member';

  return (
    <SettingsClient
      household={household}
      members={members ?? []}
      invites={invites ?? []}
      myRole={myRole}
      myUserId={user.id}
    />
  );
}
