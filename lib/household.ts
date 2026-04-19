import { createSupabaseServerClient } from '@/lib/supabase/server';
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
 */
export async function ensureHousehold(): Promise<Household> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  // Accept any pending invites for this user's email
  if (user.email) {
    const { data: invites } = await supabase
      .from('household_invites')
      .select('id, household_id, role')
      .ilike('email', user.email)
      .is('accepted_at', null);

    for (const inv of invites ?? []) {
      await supabase.from('household_members').upsert({
        household_id: inv.household_id,
        user_id: user.id,
        role: inv.role,
        invited_email: user.email,
      });
      await supabase
        .from('household_invites')
        .update({ accepted_at: new Date().toISOString() })
        .eq('id', inv.id);
    }
  }

  const existing = await getCurrentHousehold();
  if (existing) return existing;

  const defaultName = (user.user_metadata?.name as string | undefined)
    || (user.email ? `${user.email.split('@')[0]}'s Household` : 'My Household');

  const { data: created, error } = await supabase
    .from('households')
    .insert({ name: defaultName })
    .select('*')
    .single();
  if (error || !created) throw error ?? new Error('Failed to create household');

  await supabase.from('household_members').insert({
    household_id: created.id,
    user_id: user.id,
    role: 'owner',
  });

  return created as Household;
}

export async function requireHousehold(): Promise<Household> {
  const h = await ensureHousehold();
  return h;
}
