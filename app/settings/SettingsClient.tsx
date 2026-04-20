'use client';

import { useState, useTransition } from 'react';
import type { Household, MemberRole } from '@/lib/types';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { DangerZone } from './DangerZone';
// [TESTING ONLY - REMOVE BEFORE PRODUCTION] - delete this import and its
// render below. See BACKLOG.md > "Pre-production cleanup".
import { SeedDemoPanel } from './SeedDemoPanel';

interface MemberRow {
  user_id: string;
  role: MemberRole;
  joined_at: string;
  invited_email: string | null;
  display_name: string | null;
  avatar_url: string | null;
}

interface InviteRow {
  id: string;
  email: string;
  role: MemberRole;
  accepted_at: string | null;
  created_at: string;
}

interface Props {
  household: Household;
  members: MemberRow[];
  invites: InviteRow[];
  myRole: MemberRole;
  myUserId: string;
}

export function SettingsClient({ household, members, invites, myRole, myUserId }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState(household.name);
  const [currency, setCurrency] = useState(household.currency);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<MemberRole>('member');
  const [error, setError] = useState<string | null>(null);
  const supabase = createSupabaseBrowserClient();

  function handleSaveHousehold() {
    setError(null);
    start(async () => {
      const { error } = await supabase
        .from('households')
        .update({ name, currency })
        .eq('id', household.id);
      if (error) setError(error.message);
      else router.refresh();
    });
  }

  function handleInvite() {
    setError(null);
    if (!inviteEmail.trim()) return;
    start(async () => {
      const { error } = await supabase.from('household_invites').insert({
        household_id: household.id,
        email: inviteEmail.trim().toLowerCase(),
        role: inviteRole,
        invited_by: myUserId,
      });
      if (error) setError(error.message);
      else {
        setInviteEmail('');
        router.refresh();
      }
    });
  }

  function handleRevokeInvite(id: string) {
    start(async () => {
      const { error } = await supabase.from('household_invites').delete().eq('id', id);
      if (error) setError(error.message);
      else router.refresh();
    });
  }

  function handleRemoveMember(userId: string) {
    if (!confirm('Remove this household member?')) return;
    start(async () => {
      const { error } = await supabase
        .from('household_members')
        .delete()
        .eq('household_id', household.id)
        .eq('user_id', userId);
      if (error) setError(error.message);
      else router.refresh();
    });
  }

  const isOwner = myRole === 'owner';

  return (
    <div className="space-y-8 max-w-3xl">
      <h1 className="text-2xl font-semibold">Settings</h1>
      {error && (
        <div className="bg-red-900/30 border border-red-800/50 rounded-md p-3 text-sm text-red-200">{error}</div>
      )}

      <section className="card p-5 space-y-4">
        <h2 className="font-semibold">Household</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="label">Name</label>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={!isOwner}
            />
          </div>
          <div>
            <label className="label">Currency</label>
            <input
              className="input"
              value={currency}
              onChange={(e) => setCurrency(e.target.value.toUpperCase())}
              disabled={!isOwner}
            />
          </div>
        </div>
        {isOwner && (
          <button className="btn-primary" onClick={handleSaveHousehold} disabled={pending}>
            Save household
          </button>
        )}
      </section>

      <section className="card p-5 space-y-4">
        <h2 className="font-semibold">Members ({members.length})</h2>
        <ul className="divide-y divide-brand-800">
          {members.map((m) => {
            const name = m.display_name?.trim() || m.invited_email || m.user_id.slice(0, 8);
            const email = m.invited_email && m.invited_email !== name ? m.invited_email : null;
            const initials = (m.display_name || m.invited_email || '?')
              .split(/[\s@]+/)
              .map((p) => p.charAt(0))
              .join('')
              .slice(0, 2)
              .toUpperCase();
            return (
              <li key={m.user_id} className="py-2 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  {m.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={m.avatar_url}
                      alt=""
                      className="w-8 h-8 rounded-full object-cover border border-brand-700 flex-shrink-0"
                    />
                  ) : (
                    <span className="w-8 h-8 rounded-full bg-brand-800 border border-brand-700 flex items-center justify-center text-[11px] text-brand-200 flex-shrink-0">
                      {initials}
                    </span>
                  )}
                  <div className="min-w-0">
                    <div className="text-sm truncate">
                      {name}
                      {m.user_id === myUserId && (
                        <span className="ml-2 text-xs text-brand-300">(you)</span>
                      )}
                    </div>
                    <div className="text-xs text-brand-400 truncate">
                      {m.role} - joined {new Date(m.joined_at).toLocaleDateString()}
                      {email && <> - {email}</>}
                    </div>
                  </div>
                </div>
                {isOwner && m.user_id !== myUserId && (
                  <button className="btn-ghost text-red-300" onClick={() => handleRemoveMember(m.user_id)}>
                    Remove
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {isOwner && (
        <section className="card p-5 space-y-4">
          <h2 className="font-semibold">Invite a member</h2>
          <p className="text-sm text-brand-300">
            Create an invite for an email address. When that person signs in with the same email,
            they will automatically be added to the household.
          </p>
          <div className="grid sm:grid-cols-3 gap-3">
            <input
              type="email"
              className="input sm:col-span-2"
              placeholder="email@example.com"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
            />
            <select
              className="input"
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as MemberRole)}
            >
              <option value="member">Member</option>
              <option value="owner">Owner</option>
            </select>
          </div>
          <button className="btn-primary" onClick={handleInvite} disabled={pending}>
            Create invite
          </button>

          {invites.length > 0 && (
            <div className="pt-4">
              <h3 className="text-sm font-medium mb-2">Pending invites</h3>
              <ul className="divide-y divide-brand-800">
                {invites.map((inv) => (
                  <li key={inv.id} className="py-2 flex items-center justify-between text-sm">
                    <div>
                      {inv.email} <span className="text-brand-400">({inv.role})</span>
                    </div>
                    <button className="btn-ghost text-red-300" onClick={() => handleRevokeInvite(inv.id)}>
                      Revoke
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {/* [TESTING ONLY - REMOVE BEFORE PRODUCTION] */}
      <SeedDemoPanel isOwner={isOwner} />

      <DangerZone householdName={household.name} isOwner={isOwner} />
    </div>
  );
}
