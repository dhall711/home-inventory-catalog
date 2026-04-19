'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

interface CollectionEntry { id: string; name: string; cover_photo_url: string | null; count: number }
interface LocationEntry { id: string; name: string; count: number }
interface TagEntry { id: string; name: string }
interface SavedSearchEntry { id: string; name: string; query_string: string }

interface Props {
  householdName: string;
  itemCount: number;
  collections: CollectionEntry[];
  locations: LocationEntry[];
  tags: TagEntry[];
  savedSearches: SavedSearchEntry[];
}

export function Sidebar({ householdName, itemCount, collections, locations, tags, savedSearches }: Props) {
  const pathname = usePathname() ?? '';
  const router = useRouter();
  const sp = useSearchParams();
  const currentLocId = sp?.get('location_id');
  const currentColId = sp?.get('collection_id');
  const currentTagId = sp?.get('tag_id');

  const [mobileOpen, setMobileOpen] = useState(false);

  // Close drawer when route changes.
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname, sp]);

  return (
    <>
      {/* Mobile open button - sticky bar at the top of the page. */}
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        className="lg:hidden fixed top-3 left-3 z-30 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-brand-900/80 backdrop-blur border border-brand-700 text-sm text-brand-100"
        aria-label="Open menu"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
        Menu
      </button>

      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/60"
          onClick={() => setMobileOpen(false)}
          aria-hidden
        />
      )}

      <aside
        className={`
          fixed lg:sticky top-0 left-0 z-50 h-screen w-72 lg:w-64
          bg-brand-950/95 lg:bg-brand-950/40 backdrop-blur
          border-r border-brand-800 flex flex-col
          transform transition-transform duration-200
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
      >
        <div className="flex items-center justify-between p-4 border-b border-brand-800">
          <Link href="/" className="font-semibold tracking-tight">
            Home Inventory
          </Link>
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className="lg:hidden text-brand-300 text-xl leading-none px-2"
            aria-label="Close menu"
          >
            ×
          </button>
        </div>

        <div className="px-4 py-2 text-xs text-brand-400 border-b border-brand-800/60 truncate">
          {householdName}
        </div>

        <nav className="flex-1 overflow-y-auto p-3 space-y-1 text-sm">
          <NavItem href="/" label="Dashboard" active={pathname === '/'} />
          <NavItem
            href="/items"
            label="Items"
            badge={itemCount.toLocaleString()}
            active={pathname === '/items'}
          />
          <NavItem href="/batch" label="Batch capture" active={pathname.startsWith('/batch')} />
          <Link
            href="/items/new"
            className="block mt-2 mb-3 text-center btn-primary"
          >
            + Add item
          </Link>

          <Group title="Collections" defaultOpen>
            {collections.length === 0 ? (
              <Empty>None yet. <Link href="/collections" className="underline">Create one</Link>.</Empty>
            ) : (
              <ul className="space-y-0.5">
                {collections.map((c) => {
                  const isActive = currentColId === c.id || pathname === `/collections/${c.id}`;
                  return (
                    <li key={c.id}>
                      <Link
                        href={`/items?collection_id=${c.id}`}
                        className={`flex items-center gap-2 rounded px-2 py-1 ${
                          isActive ? 'bg-brand-700/60 text-white' : 'hover:bg-brand-800/60 text-brand-200'
                        }`}
                      >
                        {c.cover_photo_url ? (
                          <img src={c.cover_photo_url} alt="" className="w-5 h-5 rounded object-cover" />
                        ) : (
                          <span className="w-5 h-5 rounded bg-brand-800 inline-block" />
                        )}
                        <span className="truncate flex-1 text-xs">{c.name}</span>
                        <span className="text-[10px] text-brand-400">{c.count}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
            <Link href="/collections" className="block text-xs text-brand-300 hover:text-brand-100 mt-1">
              Manage collections →
            </Link>
          </Group>

          <Group title="Locations">
            {locations.length === 0 ? (
              <Empty>None yet. <Link href="/locations" className="underline">Create one</Link>.</Empty>
            ) : (
              <ul className="space-y-0.5">
                {locations.map((l) => {
                  const isActive = currentLocId === l.id;
                  return (
                    <li key={l.id}>
                      <Link
                        href={`/items?location_id=${l.id}`}
                        className={`flex items-center justify-between rounded px-2 py-1 text-xs ${
                          isActive ? 'bg-brand-700/60 text-white' : 'hover:bg-brand-800/60 text-brand-200'
                        }`}
                      >
                        <span className="truncate">{l.name}</span>
                        <span className="text-[10px] text-brand-400">{l.count}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
            <Link href="/locations" className="block text-xs text-brand-300 hover:text-brand-100 mt-1">
              Manage locations →
            </Link>
          </Group>

          <Group title="Tags">
            {tags.length === 0 ? (
              <Empty>None yet.</Empty>
            ) : (
              <div className="flex flex-wrap gap-1">
                {tags.slice(0, 12).map((t) => (
                  <Link
                    key={t.id}
                    href={`/items?tag_id=${t.id}`}
                    className={`px-2 py-0.5 rounded-full text-[11px] border ${
                      currentTagId === t.id
                        ? 'bg-brand-700 border-brand-600 text-white'
                        : 'border-brand-800 text-brand-300 hover:bg-brand-800'
                    }`}
                  >
                    {t.name}
                  </Link>
                ))}
              </div>
            )}
            <Link href="/tags" className="block text-xs text-brand-300 hover:text-brand-100 mt-2">
              All tags →
            </Link>
          </Group>

          <Group title="Saved searches">
            {savedSearches.length === 0 ? (
              <Empty>Use &quot;Save&quot; on the items page to keep a filter handy.</Empty>
            ) : (
              <ul className="space-y-0.5">
                {savedSearches.map((s) => (
                  <li key={s.id} className="group flex items-center gap-1">
                    <Link
                      href={`/items?${s.query_string.replace(/^\?/, '')}`}
                      className="flex-1 rounded px-2 py-1 text-xs hover:bg-brand-800/60 text-brand-200 truncate"
                    >
                      {s.name}
                    </Link>
                    <button
                      type="button"
                      title="Delete saved search"
                      aria-label={`Delete saved search ${s.name}`}
                      onClick={async () => {
                        if (!confirm(`Delete saved search "${s.name}"?`)) return;
                        const res = await fetch(`/api/saved-searches/${s.id}`, { method: 'DELETE' });
                        if (res.ok) router.refresh();
                      }}
                      className="opacity-0 group-hover:opacity-100 text-brand-400 hover:text-red-300 px-1.5 text-xs"
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Group>
        </nav>

        <div className="border-t border-brand-800 p-3 text-sm space-y-0.5">
          <NavItem href="/reports" label="Reports" active={pathname.startsWith('/reports')} />
          <NavItem href="/settings" label="Settings" active={pathname.startsWith('/settings')} />
          <form action="/api/auth/signout" method="post">
            <button
              type="submit"
              className="block w-full text-left rounded px-2 py-1.5 text-brand-300 hover:bg-brand-800/60"
            >
              Sign out
            </button>
          </form>
        </div>
      </aside>
    </>
  );
}

function NavItem({ href, label, active, badge }: { href: string; label: string; active: boolean; badge?: string }) {
  return (
    <Link
      href={href}
      className={`flex items-center justify-between rounded px-2 py-1.5 ${
        active ? 'bg-brand-700/70 text-white' : 'text-brand-200 hover:bg-brand-800/60'
      }`}
    >
      <span>{label}</span>
      {badge !== undefined && <span className="text-[10px] text-brand-300 font-mono">{badge}</span>}
    </Link>
  );
}

function Group({ title, children, defaultOpen }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between text-[11px] uppercase tracking-wider text-brand-400 hover:text-brand-200 px-2 py-1"
      >
        <span>{title}</span>
        <span>{open ? '−' : '+'}</span>
      </button>
      {open && <div className="mt-1 px-1 space-y-1">{children}</div>}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="text-xs text-brand-500 px-2">{children}</div>;
}
