import { getCurrentUser, getCurrentHousehold, ensureProfile } from '@/lib/household';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { ChatWidget } from './ChatWidget';

/**
 * Server-side wrapper that gathers all the live counts/lists the sidebar
 * shows (collections + item counts, locations, popular tags, saved searches),
 * then hands them to the client Sidebar/TopBar.
 *
 * If the user isn't signed in we just render <main>; the auth pages handle
 * their own layout.
 */
export async function AppShell({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) {
    return <main className="max-w-7xl mx-auto px-4 py-6">{children}</main>;
  }

  const household = await getCurrentHousehold();
  if (!household) {
    return <main className="max-w-7xl mx-auto px-4 py-6">{children}</main>;
  }

  // Cheap: ensureProfile upserts/reads the current user's profile row.
  // If it fails for any reason we still want the shell to render.
  const profile = await ensureProfile().catch(() => ({
    id: user.id,
    display_name: null as string | null,
    avatar_url: null as string | null,
  }));

  const supabase = await createSupabaseServerClient();

  const [{ count: itemCount }, { data: collections }, { data: locations }, { data: tags }] =
    await Promise.all([
      supabase.from('items').select('id', { count: 'exact', head: true }).eq('household_id', household.id),
      supabase
        .from('collections')
        .select('id, name, cover_photo_url')
        .eq('household_id', household.id)
        .order('name'),
      supabase.from('locations').select('id, name, parent_id').eq('household_id', household.id).order('name'),
      supabase.from('tags').select('id, name').eq('household_id', household.id).order('name').limit(50),
    ]);

  // Saved searches table may not be migrated yet on older deployments; tolerate
  // a missing-relation error so the rest of the shell still renders.
  const savedSearches = await (async () => {
    const { data, error } = await supabase
      .from('saved_searches')
      .select('id, name, query_string')
      .eq('household_id', household.id)
      .order('created_at', { ascending: true });
    if (error) return [];
    return data ?? [];
  })();

  // Pre-compute item counts per collection so the sidebar doesn't need a
  // round-trip per badge.
  const { data: itemsByCollection } = await supabase
    .from('items')
    .select('collection_id')
    .eq('household_id', household.id)
    .not('collection_id', 'is', null);
  const collectionCounts = new Map<string, number>();
  for (const row of itemsByCollection ?? []) {
    if (row.collection_id) {
      collectionCounts.set(row.collection_id, (collectionCounts.get(row.collection_id) ?? 0) + 1);
    }
  }

  // Item counts per location too (top-level only is fine for the sidebar).
  const { data: itemsByLocation } = await supabase
    .from('items')
    .select('location_id')
    .eq('household_id', household.id)
    .not('location_id', 'is', null);
  const locationCounts = new Map<string, number>();
  for (const row of itemsByLocation ?? []) {
    if (row.location_id) {
      locationCounts.set(row.location_id, (locationCounts.get(row.location_id) ?? 0) + 1);
    }
  }

  return (
    <div className="min-h-screen lg:flex">
      <Sidebar
        householdName={household.name}
        itemCount={itemCount ?? 0}
        collections={(collections ?? []).map((c) => ({
          id: c.id,
          name: c.name,
          cover_photo_url: c.cover_photo_url,
          count: collectionCounts.get(c.id) ?? 0,
        }))}
        locations={(locations ?? []).map((l) => ({
          id: l.id,
          name: l.name,
          count: locationCounts.get(l.id) ?? 0,
        }))}
        tags={tags ?? []}
        savedSearches={savedSearches ?? []}
        currentUser={{
          email: user.email ?? null,
          displayName: profile.display_name,
          avatarUrl: profile.avatar_url,
        }}
      />
      <div className="flex-1 min-w-0 flex flex-col">
        <TopBar
          householdName={household.name}
          userEmail={user.email ?? null}
          displayName={profile.display_name}
        />
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 lg:px-6 py-6">
          {children}
        </main>
      </div>
      <ChatWidget />
    </div>
  );
}
