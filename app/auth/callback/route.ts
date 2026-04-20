import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { ensureHousehold, ensureProfile } from '@/lib/household';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/';
  const errorParam = searchParams.get('error');

  // OAuth providers surface errors as query params (e.g. access_denied)
  // rather than a failed code exchange. Pass them through so /login can
  // render a friendly message.
  if (errorParam) {
    return NextResponse.redirect(`${origin}/login?error=oauth`);
  }

  if (code) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // Seed/refresh the profile first so ensureHousehold can read a
      // fresh display_name when it picks a default household name.
      try {
        await ensureProfile();
      } catch (err) {
        console.error('Failed to ensure profile on sign-in', err);
      }
      try {
        await ensureHousehold();
      } catch (err) {
        console.error('Failed to ensure household on first login', err);
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
