'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const links = [
  { href: '/', label: 'Dashboard' },
  { href: '/items', label: 'Items' },
  { href: '/items/new', label: 'Add Item' },
  { href: '/batch', label: 'Batch Capture' },
  { href: '/locations', label: 'Locations' },
  { href: '/collections', label: 'Collections' },
  { href: '/tags', label: 'Tags' },
  { href: '/reports', label: 'Reports' },
  { href: '/settings', label: 'Settings' },
];

export function Nav({ householdName, userEmail }: { householdName?: string; userEmail?: string }) {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-30 bg-brand-950/80 backdrop-blur border-b border-brand-800">
      <div className="max-w-7xl mx-auto px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <Link href="/" className="font-semibold text-lg tracking-tight">
          Home Inventory
        </Link>
        {householdName && (
          <span className="hidden sm:inline text-xs text-brand-300">/ {householdName}</span>
        )}
        <nav className="flex flex-wrap items-center gap-1 text-sm ml-auto">
          {links.map((l) => {
            const active = pathname === l.href || (l.href !== '/' && pathname?.startsWith(l.href));
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`px-2.5 py-1 rounded-md transition-colors ${
                  active ? 'bg-brand-700 text-white' : 'text-brand-200 hover:bg-brand-800'
                }`}
              >
                {l.label}
              </Link>
            );
          })}
          <form action="/api/auth/signout" method="post" className="ml-2">
            <button type="submit" className="px-2.5 py-1 rounded-md text-brand-300 hover:bg-brand-800 text-sm">
              Sign out
            </button>
          </form>
          {userEmail && (
            <span className="hidden md:inline text-xs text-brand-400 ml-2">{userEmail}</span>
          )}
        </nav>
      </div>
    </header>
  );
}
