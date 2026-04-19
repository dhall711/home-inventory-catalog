import { createSupabaseServerClient, createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import type { Household } from '@/lib/types';
import { redirect } from 'next/navigation';

export async function getCurrentUser() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  return user;
}

export async function getCurrentHousehold(): Promise<Household | null> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: members } = await supabase
    .from('household_members')
    .select('household_id, joined_at')
    .eq('user_id', user.id)
    .order('joined_at', { ascending: true })
    .limit(1);

  if (!members || members.length === 0) return null;

  const { data: household } = await supabase
    .from('households')
    .select('*')
    .eq('id', members[0].household_id)
    .single();

  return household as Household | null;
}

/**
 * Ensures the current user has a household; creates one on first sign-in
 * (using their email or display name as the default name) and accepts any
 * pending invites that match their email address.
 *
 * Bootstrap inserts (households + first household_members row + invite
 * acceptance) are done via the service-role client to bypass RLS. This
 * avoids a known @supabase/ssr race where cookies set in the auth-code
 * exchange aren't yet visible to PostgREST in the same request, leaving
 * auth.uid() NULL inside the INSERT and tripping a 42501 policy violation.
 * We still validate the user is signed in via the regular client first.
 */
export async function ensureHousehold(): Promise<Household> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const admin = createSupabaseServiceRoleClient();

  // Accept any pending invites for this user's email
  if (user.email) {
    const { data: invites } = await admin
      .from('household_invites')
      .select('id, household_id, role')
      .ilike('email', user.email)
      .is('accepted_at', null);

    for (const inv of invites ?? []) {
      await admin.from('household_members').upsert({
        household_id: inv.household_id,
        user_id: user.id,
        role: inv.role,
        invited_email: user.email,
      });
      await admin
        .from('household_invites')
        .update({ accepted_at: new Date().toISOString() })
        .eq('id', inv.id);
    }
  }

  const existing = await getCurrentHousehold();
  if (existing) return existing;

  // The user-scoped getCurrentHousehold above can briefly miss freshly-
  // created memberships during the cookie hand-off; verify via admin too
  // so we don't end up creating a duplicate household for the same user.
  const { data: existingMember } = await admin
    .from('household_members')
    .select('household_id')
    .eq('user_id', user.id)
    .order('joined_at', { ascending: true })
    .limit(1);
  if (existingMember && existingMember.length > 0) {
    const { data: existingHh } = await admin
      .from('households')
      .select('*')
      .eq('id', existingMember[0].household_id)
      .single();
    if (existingHh) return existingHh as Household;
  }

  const defaultName = (user.user_metadata?.name as string | undefined)
    || (user.email ? `${user.email.split('@')[0]}'s Household` : 'My Household');

  const { data: created, error } = await admin
    .from('households')
    .insert({ name: defaultName })
    .select('*')
    .single();
  if (error || !created) throw error ?? new Error('Failed to create household');

  const { error: memberError } = await admin.from('household_members').insert({
    household_id: created.id,
    user_id: user.id,
    role: 'owner',
  });
  if (memberError) throw memberError;

  return created as Household;
}

export async function requireHousehold(): Promise<Household> {
  const h = await ensureHousehold();
  return h;
}
