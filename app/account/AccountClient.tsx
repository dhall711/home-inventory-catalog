'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import type { Profile } from '@/lib/household';

interface Props {
  userId: string;
  email: string;
  profile: Profile;
  hasPasswordAuth: boolean;
  providers: string[];
}

type Status = { kind: 'ok' | 'err'; message: string } | null;

export function AccountClient({ email, profile, hasPasswordAuth, providers }: Props) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState(profile.display_name ?? '');
  const [avatarUrl, setAvatarUrl] = useState(profile.avatar_url);
  const [newEmail, setNewEmail] = useState('');

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [status, setStatus] = useState<Record<string, Status>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const avatarInput = useRef<HTMLInputElement>(null);

  function setSect(section: string, s: Status) {
    setStatus((prev) => ({ ...prev, [section]: s }));
  }

  async function saveName() {
    setBusy('name');
    setSect('name', null);
    try {
      const res = await fetch('/api/account/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ display_name: displayName }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Failed');
      setSect('name', { kind: 'ok', message: 'Saved.' });
      router.refresh();
    } catch (err) {
      setSect('name', { kind: 'err', message: err instanceof Error ? err.message : 'Failed' });
    } finally {
      setBusy(null);
    }
  }

  async function uploadAvatar(file: File) {
    setBusy('avatar');
    setSect('avatar', null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/account/avatar', { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Upload failed');
      setAvatarUrl(json.profile?.avatar_url ?? null);
      setSect('avatar', { kind: 'ok', message: 'Avatar updated.' });
      router.refresh();
    } catch (err) {
      setSect('avatar', { kind: 'err', message: err instanceof Error ? err.message : 'Failed' });
    } finally {
      setBusy(null);
    }
  }

  async function removeAvatar() {
    if (!confirm('Remove your avatar?')) return;
    setBusy('avatar');
    try {
      const res = await fetch('/api/account/avatar', { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Failed');
      setAvatarUrl(null);
      setSect('avatar', { kind: 'ok', message: 'Avatar removed.' });
      router.refresh();
    } catch (err) {
      setSect('avatar', { kind: 'err', message: err instanceof Error ? err.message : 'Failed' });
    } finally {
      setBusy(null);
    }
  }

  async function changeEmail() {
    if (!newEmail.trim()) return;
    setBusy('email');
    setSect('email', null);
    try {
      const res = await fetch('/api/account/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: newEmail.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Failed');
      setSect('email', {
        kind: 'ok',
        message: `Confirmation link sent to ${newEmail.trim()}. Click it to finish the change.`,
      });
      setNewEmail('');
    } catch (err) {
      setSect('email', { kind: 'err', message: err instanceof Error ? err.message : 'Failed' });
    } finally {
      setBusy(null);
    }
  }

  async function changePassword() {
    setSect('password', null);
    if (newPassword.length < 8) {
      setSect('password', { kind: 'err', message: 'New password must be at least 8 characters.' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setSect('password', { kind: 'err', message: 'Passwords do not match.' });
      return;
    }
    setBusy('password');
    try {
      const supabase = createSupabaseBrowserClient();
      // Re-authenticate with the current password before allowing the
      // update. This mirrors the standard "sudo" pattern and protects
      // against a session hijack silently rewriting the password.
      const { error: reauthErr } = await supabase.auth.signInWithPassword({
        email,
        password: currentPassword,
      });
      if (reauthErr) {
        setSect('password', { kind: 'err', message: 'Current password is incorrect.' });
        return;
      }
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setSect('password', { kind: 'ok', message: 'Password updated.' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setSect('password', { kind: 'err', message: err instanceof Error ? err.message : 'Failed' });
    } finally {
      setBusy(null);
    }
  }

  const initials = (profile.display_name || email || '?')
    .split(/[\s@]+/)
    .map((p) => p.charAt(0))
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="space-y-8 max-w-3xl">
      <h1 className="text-2xl font-semibold">Account</h1>

      {/* Profile */}
      <section className="card p-5 space-y-4">
        <h2 className="font-semibold">Profile</h2>

        <div className="flex items-start gap-5">
          <div className="flex-shrink-0">
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarUrl}
                alt=""
                className="w-20 h-20 rounded-full object-cover border border-brand-700"
              />
            ) : (
              <div className="w-20 h-20 rounded-full bg-brand-800 border border-brand-700 flex items-center justify-center text-xl text-brand-200">
                {initials}
              </div>
            )}
          </div>
          <div className="flex-1 space-y-2">
            <input
              ref={avatarInput}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) uploadAvatar(f);
                e.target.value = '';
              }}
            />
            <div className="flex gap-2">
              <button
                type="button"
                className="btn-ghost border border-brand-700"
                onClick={() => avatarInput.current?.click()}
                disabled={busy === 'avatar'}
              >
                {busy === 'avatar' ? 'Uploading...' : 'Upload new photo'}
              </button>
              {avatarUrl && (
                <button
                  type="button"
                  className="btn-ghost text-red-300"
                  onClick={removeAvatar}
                  disabled={busy === 'avatar'}
                >
                  Remove
                </button>
              )}
            </div>
            <p className="text-xs text-brand-400">
              JPG or PNG. At least 200x200. Max 5 MB.
            </p>
            <StatusLine s={status.avatar} />
          </div>
        </div>

        <div className="pt-2">
          <label className="label" htmlFor="display-name">Display name</label>
          <div className="flex gap-2">
            <input
              id="display-name"
              className="input flex-1"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="How your name shows in households"
              maxLength={80}
            />
            <button
              type="button"
              className="btn-primary"
              onClick={saveName}
              disabled={busy === 'name' || displayName === (profile.display_name ?? '')}
            >
              {busy === 'name' ? 'Saving...' : 'Save'}
            </button>
          </div>
          <StatusLine s={status.name} />
        </div>
      </section>

      {/* Email */}
      <section className="card p-5 space-y-4">
        <h2 className="font-semibold">Email</h2>
        <p className="text-sm text-brand-300">
          Current email: <span className="font-medium">{email}</span>
        </p>
        <div className="grid sm:grid-cols-[1fr_auto] gap-2">
          <input
            type="email"
            className="input"
            placeholder="new-email@example.com"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
          />
          <button
            type="button"
            className="btn-primary"
            onClick={changeEmail}
            disabled={busy === 'email' || !newEmail.trim() || newEmail.trim() === email}
          >
            {busy === 'email' ? 'Sending...' : 'Send confirmation'}
          </button>
        </div>
        <p className="text-xs text-brand-400">
          We will email a confirmation link to the new address. The change only
          takes effect after you click it.
        </p>
        <StatusLine s={status.email} />
      </section>

      {/* Password */}
      {hasPasswordAuth && (
        <section className="card p-5 space-y-4">
          <h2 className="font-semibold">Password</h2>
          <div className="grid sm:grid-cols-3 gap-3">
            <div>
              <label className="label" htmlFor="curr-password">Current</label>
              <input
                id="curr-password"
                type="password"
                autoComplete="current-password"
                className="input"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
              />
            </div>
            <div>
              <label className="label" htmlFor="new-pw">New</label>
              <input
                id="new-pw"
                type="password"
                autoComplete="new-password"
                minLength={8}
                className="input"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>
            <div>
              <label className="label" htmlFor="confirm-pw">Confirm</label>
              <input
                id="confirm-pw"
                type="password"
                autoComplete="new-password"
                minLength={8}
                className="input"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
          </div>
          <button
            type="button"
            className="btn-primary"
            onClick={changePassword}
            disabled={busy === 'password' || !currentPassword || !newPassword || !confirmPassword}
          >
            {busy === 'password' ? 'Updating...' : 'Update password'}
          </button>
          <StatusLine s={status.password} />
        </section>
      )}

      {/* Linked providers */}
      {providers.length > 0 && (
        <section className="card p-5 space-y-2">
          <h2 className="font-semibold">Sign-in methods</h2>
          <ul className="text-sm text-brand-300 space-y-1">
            {providers.map((p) => (
              <li key={p} className="capitalize">
                - {p === 'email' ? 'Email (magic link / password)' : p}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Sign out */}
      <section className="card p-5 space-y-3">
        <h2 className="font-semibold">Session</h2>
        <form action="/api/auth/signout" method="post">
          <button type="submit" className="btn-ghost border border-brand-700">
            Sign out
          </button>
        </form>
      </section>
    </div>
  );
}

function StatusLine({ s }: { s: Status }) {
  if (!s) return null;
  return (
    <p
      className={`text-xs mt-1 ${
        s.kind === 'ok' ? 'text-emerald-300' : 'text-red-300'
      }`}
    >
      {s.message}
    </p>
  );
}
