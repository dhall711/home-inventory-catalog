'use client';

import { useState } from 'react';
import Link from 'next/link';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || window.location.origin;
      // Go through /auth/callback so the PKCE code is exchanged server-side
      // and session cookies are set before we land on /auth/reset.
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${siteUrl}/auth/callback?next=${encodeURIComponent('/auth/reset')}`,
      });
      if (error) throw error;
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send reset email');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="card w-full max-w-md p-8">
        <h1 className="text-2xl font-semibold mb-1">Reset your password</h1>
        <p className="text-sm text-brand-300 mb-6">
          Enter the email you signed up with and we will send you a link to set a new password.
        </p>

        {sent ? (
          <div className="space-y-4">
            <div className="bg-brand-800/60 border border-brand-700 rounded-md p-4 text-sm">
              If an account exists for <span className="font-medium">{email}</span>, a reset link
              is on its way. Check your inbox (and spam folder).
            </div>
            <Link href="/login" className="btn-ghost w-full text-center">
              Back to sign in
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="label" htmlFor="forgot-email">Email</label>
              <input
                id="forgot-email"
                type="email"
                autoComplete="email"
                required
                className="input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </div>
            {error && (
              <div className="text-sm text-red-200 bg-red-900/30 border border-red-800/50 rounded-md p-2">
                {error}
              </div>
            )}
            <button type="submit" className="btn-primary w-full" disabled={busy || !email}>
              {busy ? 'Sending...' : 'Send reset link'}
            </button>
            <Link href="/login" className="block text-center text-xs text-brand-300 hover:text-white">
              Back to sign in
            </Link>
          </form>
        )}
      </div>
    </main>
  );
}
