import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

/**
 * Marks onboarding as skipped/completed so the dashboard doesn't keep
 * redirecting back to the wizard. Persists for 1 year.
 */
export async function POST() {
  const store = await cookies();
  store.set('onboarding_skipped', '1', {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
    httpOnly: false,
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const store = await cookies();
  store.delete('onboarding_skipped');
  return NextResponse.json({ ok: true });
}
