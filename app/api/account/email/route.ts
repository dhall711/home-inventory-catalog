import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/household';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

/**
 * Change the signed-in user's email. Supabase sends a confirmation link
 * to the NEW address; the change only takes effect once that link is
 * clicked. The user's existing session stays valid throughout.
 */
export async function POST(request: Request) {
  await requireUser();
  const body = (await request.json().catch(() => null)) as { email?: unknown } | null;
  if (!body) return NextResponse.json({ error: 'invalid body' }, { status: 400 });

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;

  const { error } = await supabase.auth.updateUser(
    { email },
    { emailRedirectTo: `${siteUrl}/auth/callback?next=/account` }
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}
