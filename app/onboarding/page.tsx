import { redirect } from 'next/navigation';
import { requireHousehold, requireUser } from '@/lib/household';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { OnboardingClient } from './OnboardingClient';

export const dynamic = 'force-dynamic';

export default async function OnboardingPage() {
  const user = await requireUser();
  const household = await requireHousehold();
  const supabase = await createSupabaseServerClient();

  const { count } = await supabase
    .from('items')
    .select('id', { count: 'exact', head: true })
    .eq('household_id', household.id);

  // Already populated -> bounce to dashboard. Onboarding is a one-shot.
  if ((count ?? 0) > 0) {
    redirect('/');
  }

  const [{ data: locations }, { data: collections }] = await Promise.all([
    supabase.from('locations').select('id, name').eq('household_id', household.id),
    supabase.from('collections').select('id, name').eq('household_id', household.id),
  ]);

  return (
    <OnboardingClient
      household={household}
      userEmail={user.email ?? null}
      existingLocations={locations ?? []}
      existingCollections={collections ?? []}
    />
  );
}
