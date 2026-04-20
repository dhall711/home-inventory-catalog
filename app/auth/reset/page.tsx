'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

/**
 * Set a new password after clicking the reset link in email.
 *
 * Flow:
 * 1. The /forgot page sends a reset email whose link points at
 *    /auth/callback?next=/auth/reset. The callback exchanges the PKCE
 *    code so the browser arrives here with a valid session cookie.
 * 2. On mount we confirm there is a user; if not, bounce to /login.
 * 3. User sets + confirms a new password -> supabase.auth.updateUser.
 * 4. Redirect to `/`.
 */
export default function ResetPasswordPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [authed, setAuthed] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const supabase = createSupabaseBrowserClient();
      const { data } = await supabase.auth.getUser();
      if (!active) return;
      setAuthed(!!data.user);
      setChecking(false);
    })();
    return () => {
      active = false;
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setSuccess(true);
      setTimeout(() => router.push('/'), 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not set password');
    } finally {
      setBusy(false);
    }
  }

  if (checking) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4">
        <div className="card w-full max-w-md p-8">
          <div className="h-5 w-40 bg-brand-800/50 rounded animate-pulse mb-3" />
          <div className="h-3 w-64 bg-brand-800/50 rounded animate-pulse" />
        </div>
      </main>
    );
  }

  if (!authed) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4">
        <div className="card w-full max-w-md p-8 space-y-3">
          <h1 className="text-2xl font-semibold">Reset link expired</h1>
          <p className="text-sm text-brand-300">
            Your reset session has expired or the link was already used.
            Request a new one below.
          </p>
          <Link href="/forgot" className="btn-primary w-full text-center">
            Request a new link
          </Link>
          <Link href="/login" className="block text-center text-xs text-brand-300 hover:text-white">
            Back to sign in
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="card w-full max-w-md p-8">
        <h1 className="text-2xl font-semibold mb-1">Set a new password</h1>
        <p className="text-sm text-brand-300 mb-6">
          Choose a strong password that is at least 8 characters.
        </p>

        {success ? (
          <div className="bg-brand-800/60 border border-brand-700 rounded-md p-4 text-sm">
            Password updated. Redirecting...
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="label" htmlFor="new-password">New password</label>
              <input
                id="new-password"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                className="input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div>
              <label className="label" htmlFor="confirm-password">Confirm password</label>
              <input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                className="input"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </div>
            {error && (
              <div className="text-sm text-red-200 bg-red-900/30 border border-red-800/50 rounded-md p-2">
                {error}
              </div>
            )}
            <button type="submit" className="btn-primary w-full" disabled={busy}>
              {busy ? 'Updating...' : 'Update password'}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
