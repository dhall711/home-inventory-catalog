import { NextResponse } from 'next/server';
import { requireHousehold } from '@/lib/household';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { ValueSource } from '@/lib/types';

export const runtime = 'nodejs';

const ALLOWED_SOURCES: ValueSource[] = ['manual', 'ai', 'appraisal', 'receipt'];

interface Body {
  item_id?: string;
  value?: number;
  source?: ValueSource;
  dated_on?: string;       // YYYY-MM-DD
  notes?: string | null;
}

export async function POST(request: Request) {
  const household = await requireHousehold();
  const supabase = await createSupabaseServerClient();
  const body = (await request.json().catch(() => null)) as Body | null;
  if (!body?.item_id || typeof body.value !== 'number' || !body.source || !body.dated_on) {
    return NextResponse.json(
      { error: 'item_id, value, source, dated_on required' },
      { status: 400 }
    );
  }
  if (!ALLOWED_SOURCES.includes(body.source)) {
    return NextResponse.json({ error: 'invalid source' }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(body.dated_on)) {
    return NextResponse.json({ error: 'dated_on must be YYYY-MM-DD' }, { status: 400 });
  }

  // Confirm the item is in this household. RLS already restricts inserts on
  // value_history (item_id-based policy), but we 404 nicely instead.
  const { data: item } = await supabase
    .from('items')
    .select('id')
    .eq('id', body.item_id)
    .eq('household_id', household.id)
    .single();
  if (!item) return NextResponse.json({ error: 'item not found' }, { status: 404 });

  const { data, error } = await supabase
    .from('value_history')
    .insert({
      item_id: body.item_id,
      value: body.value,
      source: body.source,
      dated_on: body.dated_on,
      notes: body.notes ?? null,
    })
    .select('*')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ entry: data }, { status: 201 });
}
