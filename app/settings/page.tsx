import { requireHousehold, requireUser } from '@/lib/household';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { SettingsClient } from './SettingsClient';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const user = await requireUser();
  const household = await requireHousehold();
  const supabase = await createSupabaseServerClient();

  const { data: memberRows } = await supabase
    .from('household_members')
    .select('user_id, role, joined_at, invited_email')
    .eq('household_id', household.id);

  // Join profiles so we can render real names/avatars instead of raw
  // UUIDs or invite emails. RLS on profiles lets us see fellow-household
  // members' profile rows.
  const userIds = (memberRows ?? []).map((m) => m.user_id);
  const { data: profileRows } = userIds.length
    ? await supabase
        .from('profiles')
        .select('id, display_name, avatar_url')
        .in('id', userIds)
    : { data: [] as { id: string; display_name: string | null; avatar_url: string | null }[] };
  const profileMap = new Map(
    (profileRows ?? []).map((p) => [p.id, p])
  );

  const members = (memberRows ?? []).map((m) => ({
    user_id: m.user_id,
    role: m.role,
    joined_at: m.joined_at,
    invited_email: m.invited_email,
    display_name: profileMap.get(m.user_id)?.display_name ?? null,
    avatar_url: profileMap.get(m.user_id)?.avatar_url ?? null,
  }));

  const { data: invites } = await supabase
    .from('household_invites')
    .select('id, email, role, accepted_at, created_at')
    .eq('household_id', household.id)
    .is('accepted_at', null);

  const myRole = members.find((m) => m.user_id === user.id)?.role ?? 'member';

  return (
    <SettingsClient
      household={household}
      members={members}
      invites={invites ?? []}
      myRole={myRole}
      myUserId={user.id}
    />
  );
}
