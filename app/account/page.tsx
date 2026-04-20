import { ensureProfile, requireUser } from '@/lib/household';
import { AccountClient } from './AccountClient';

export const dynamic = 'force-dynamic';

export default async function AccountPage() {
  const user = await requireUser();
  const profile = await ensureProfile();

  // `identities` tells us whether the user has a password (email)
  // identity, in which case we show the "Change password" section.
  const identities = user.identities ?? [];
  const hasPasswordAuth = identities.some((i) => i.provider === 'email');
  const providers = identities.map((i) => i.provider);

  return (
    <AccountClient
      userId={user.id}
      email={user.email ?? ''}
      profile={profile}
      hasPasswordAuth={hasPasswordAuth}
      providers={providers}
    />
  );
}
