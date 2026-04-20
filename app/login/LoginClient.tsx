'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

type Tab = 'signin' | 'signup';

const ERROR_COPY: Record<string, string> = {
  auth: "We couldn't complete sign-in from that link. It may have expired - please try again.",
  expired: 'That link has expired. Request a new one below.',
  oauth: 'Sign-in with your social account was cancelled or failed. Please try again.',
};

export function LoginClient() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next') ?? '/';
  const errorCode = params.get('error');

  const [tab, setTab] = useState<Tab>('signin');
  const [checkingSession, setCheckingSession] = useState(true);
  const [signedInAs, setSignedInAs] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const supabase = createSupabaseBrowserClient();
      const { data } = await supabase.auth.getUser();
      if (!active) return;
      setSignedInAs(data.user?.email ?? null);
      setCheckingSession(false);
    })();
    return () => {
      active = false;
    };
  }, []);

  if (checkingSession) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4">
        <div className="card w-full max-w-md p-8">
          <div className="h-5 w-40 bg-brand-800/50 rounded animate-pulse mb-3" />
          <div className="h-3 w-64 bg-brand-800/50 rounded animate-pulse" />
        </div>
      </main>
    );
  }

  if (signedInAs) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4">
        <div className="card w-full max-w-md p-8 space-y-4">
          <h1 className="text-2xl font-semibold">Home Inventory</h1>
          <p className="text-sm text-brand-200">
            You are already signed in as <span className="font-medium">{signedInAs}</span>.
          </p>
          <div className="flex gap-2">
            <button
              className="btn-primary flex-1"
              onClick={() => router.push(next)}
            >
              Continue
            </button>
            <form action="/api/auth/signout" method="post" className="flex-1">
              <button type="submit" className="btn-ghost w-full">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </main>
    );
  }

  const errorMessage = errorCode ? ERROR_COPY[errorCode] ?? 'Something went wrong. Please try again.' : null;

  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-10">
      <div className="card w-full max-w-md p-8">
        <h1 className="text-2xl font-semibold mb-1">Home Inventory</h1>
        <p className="text-sm text-brand-300 mb-6">
          {tab === 'signin' ? 'Sign in to your household.' : 'Create your household account.'}
        </p>

        {errorMessage && (
          <div className="mb-4 text-sm text-red-200 bg-red-900/30 border border-red-800/50 rounded-md p-3">
            {errorMessage}
          </div>
        )}

        <div className="flex gap-1 p-1 mb-6 rounded-md bg-brand-900/60 border border-brand-800">
          <TabBtn label="Sign in" active={tab === 'signin'} onClick={() => setTab('signin')} />
          <TabBtn label="Create account" active={tab === 'signup'} onClick={() => setTab('signup')} />
        </div>

        {tab === 'signin' ? <SignInForm next={next} /> : <SignUpForm onAfterSignup={() => setTab('signin')} />}
      </div>
    </main>
  );
}

function TabBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 text-sm py-1.5 rounded transition ${
        active ? 'bg-brand-700 text-white' : 'text-brand-300 hover:text-white'
      }`}
    >
      {label}
    </button>
  );
}

// ---------------------------------------------------------------------
// Sign in
// ---------------------------------------------------------------------

function SignInForm({ next }: { next: string }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<null | 'password' | 'magic' | 'google'>(null);
  const [error, setError] = useState<string | null>(null);
  const [magicSent, setMagicSent] = useState(false);

  function siteUrl() {
    return process.env.NEXT_PUBLIC_SITE_URL || window.location.origin;
  }

  async function handlePasswordSignIn(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy('password');
    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      window.location.assign(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed');
    } finally {
      setBusy(null);
    }
  }

  async function handleMagicLink() {
    setError(null);
    if (!email) {
      setError('Enter your email first.');
      return;
    }
    setBusy('magic');
    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${siteUrl()}/auth/callback?next=${encodeURIComponent(next)}`,
        },
      });
      if (error) throw error;
      setMagicSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send magic link');
    } finally {
      setBusy(null);
    }
  }

  async function handleGoogle() {
    setError(null);
    setBusy('google');
    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${siteUrl()}/auth/callback?next=${encodeURIComponent(next)}`,
        },
      });
      if (error) throw error;
      // signInWithOAuth will redirect the browser - nothing else to do here.
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google sign-in failed');
      setBusy(null);
    }
  }

  if (magicSent) {
    return (
      <div className="space-y-3">
        <div className="bg-brand-800/60 border border-brand-700 rounded-md p-4 text-sm">
          Check your inbox for a sign-in link. It expires in about an hour.
        </div>
        <button className="btn-ghost w-full" onClick={() => setMagicSent(false)}>
          Use a different method
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handlePasswordSignIn} className="space-y-3">
        <div>
          <label className="label" htmlFor="signin-email">Email</label>
          <input
            id="signin-email"
            type="email"
            autoComplete="email"
            required
            className="input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </div>
        <div>
          <div className="flex items-baseline justify-between">
            <label className="label" htmlFor="signin-password">Password</label>
            <Link href="/forgot" className="text-xs text-brand-300 hover:text-white">
              Forgot password?
            </Link>
          </div>
          <input
            id="signin-password"
            type="password"
            autoComplete="current-password"
            className="input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="(or use magic link below)"
          />
        </div>
        {error && (
          <div className="text-sm text-red-200 bg-red-900/30 border border-red-800/50 rounded-md p-2">
            {error}
          </div>
        )}
        <button
          type="submit"
          className="btn-primary w-full"
          disabled={busy !== null || !email || !password}
        >
          {busy === 'password' ? 'Signing in...' : 'Sign in'}
        </button>
      </form>

      <Divider />

      <button
        type="button"
        onClick={handleMagicLink}
        className="btn-ghost w-full border border-brand-700"
        disabled={busy !== null}
      >
        {busy === 'magic' ? 'Sending link...' : 'Email me a magic link'}
      </button>

      <button
        type="button"
        onClick={handleGoogle}
        className="btn-ghost w-full border border-brand-700 flex items-center justify-center gap-2"
        disabled={busy !== null}
      >
        <GoogleMark />
        {busy === 'google' ? 'Redirecting...' : 'Continue with Google'}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------
// Sign up
// ---------------------------------------------------------------------

function SignUpForm({ onAfterSignup }: { onAfterSignup: () => void }) {
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<null | 'confirmed' | 'check_email'>(null);

  function siteUrl() {
    return process.env.NEXT_PUBLIC_SITE_URL || window.location.origin;
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    setBusy(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { display_name: displayName.trim() || undefined },
          emailRedirectTo: `${siteUrl()}/auth/callback?next=/`,
        },
      });
      if (error) throw error;
      if (data.session) {
        window.location.assign('/');
        return;
      }
      setDone('check_email');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-up failed');
    } finally {
      setBusy(false);
    }
  }

  if (done === 'check_email') {
    return (
      <div className="space-y-3">
        <div className="bg-brand-800/60 border border-brand-700 rounded-md p-4 text-sm">
          Account created. Check your inbox for a confirmation link, then return here to sign in.
        </div>
        <button className="btn-primary w-full" onClick={onAfterSignup}>
          Back to sign in
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSignUp} className="space-y-3">
      <div>
        <label className="label" htmlFor="signup-name">Your name</label>
        <input
          id="signup-name"
          type="text"
          autoComplete="name"
          className="input"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="Jane Smith"
        />
      </div>
      <div>
        <label className="label" htmlFor="signup-email">Email</label>
        <input
          id="signup-email"
          type="email"
          autoComplete="email"
          required
          className="input"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
        />
      </div>
      <div>
        <label className="label" htmlFor="signup-password">Password</label>
        <input
          id="signup-password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          className="input"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="At least 8 characters"
        />
      </div>
      {error && (
        <div className="text-sm text-red-200 bg-red-900/30 border border-red-800/50 rounded-md p-2">
          {error}
        </div>
      )}
      <button
        type="submit"
        className="btn-primary w-full"
        disabled={busy || !email || password.length < 8}
      >
        {busy ? 'Creating account...' : 'Create account'}
      </button>
      <p className="text-xs text-brand-400 text-center">
        By creating an account you agree to store your inventory with this service.
      </p>
    </form>
  );
}

function Divider() {
  return (
    <div className="flex items-center gap-3 text-xs text-brand-500">
      <div className="flex-1 h-px bg-brand-800" />
      <span>or</span>
      <div className="flex-1 h-px bg-brand-800" />
    </div>
  );
}

function GoogleMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden>
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59a14.5 14.5 0 0 1 0-9.18l-7.98-6.19a24 24 0 0 0 0 21.56l7.98-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.9-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.17 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
      <path fill="none" d="M0 0h48v48H0z" />
    </svg>
  );
}
