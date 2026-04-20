import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/household';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

export async function PATCH(request: Request) {
  const user = await requireUser();
  const body = await request.json().catch(() => null) as { display_name?: unknown } | null;
  if (!body) return NextResponse.json({ error: 'invalid body' }, { status: 400 });

  const raw = typeof body.display_name === 'string' ? body.display_name.trim() : '';
  if (raw.length > 80) {
    return NextResponse.json({ error: 'Name must be 80 characters or fewer.' }, { status: 400 });
  }
  const display_name = raw.length > 0 ? raw : null;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('profiles')
    .update({ display_name })
    .eq('id', user.id)
    .select('id, display_name, avatar_url')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ profile: data });
}
