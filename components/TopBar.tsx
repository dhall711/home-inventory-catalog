'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';

interface Props {
  householdName: string;
  userEmail: string | null;
  displayName: string | null;
}

/**
 * Slim top header inside the AppShell. Shows breadcrumb-ish current section
 * (derived from the route) on the left and the active user/household on the
 * right. The mobile menu opener lives inside Sidebar.
 */
export function TopBar({ householdName, userEmail, displayName }: Props) {
  const pathname = usePathname() ?? '/';
  const crumbs = breadcrumbsForPath(pathname);
  const userLabel = displayName?.trim() || userEmail;

  return (
    <header className="sticky top-0 z-20 bg-brand-950/70 backdrop-blur border-b border-brand-800">
      <div className="px-4 lg:px-6 py-2.5 flex items-center justify-between gap-3">
        <nav className="text-sm flex items-center gap-1 min-w-0 ml-12 lg:ml-0">
          {crumbs.map((c, i) => (
            <span key={c.href} className="flex items-center gap-1 min-w-0">
              {i > 0 && <span className="text-brand-500">/</span>}
              {i === crumbs.length - 1 ? (
                <span className="truncate text-brand-100">{c.label}</span>
              ) : (
                <Link href={c.href} className="text-brand-300 hover:text-brand-100 truncate">{c.label}</Link>
              )}
            </span>
          ))}
        </nav>
        <div className="flex items-center gap-3 text-xs text-brand-400">
          <span className="hidden md:inline">{householdName}</span>
          {userLabel && (
            <Link
              href="/account"
              className="hidden md:inline px-2 py-0.5 rounded bg-brand-800/50 border border-brand-700/50 hover:bg-brand-800 hover:text-brand-100"
              title={userEmail ?? undefined}
            >
              {userLabel}
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}

function breadcrumbsForPath(path: string): { href: string; label: string }[] {
  if (path === '/') return [{ href: '/', label: 'Dashboard' }];
  const parts = path.split('/').filter(Boolean);
  const out: { href: string; label: string }[] = [{ href: '/', label: 'Dashboard' }];
  let acc = '';
  for (let i = 0; i < parts.length; i++) {
    acc += `/${parts[i]}`;
    let label = parts[i].replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase());
    if (label === 'Items' || label === 'Collections' || label === 'Locations' || label === 'Tags' || label === 'Reports' || label === 'Settings' || label === 'Batch' || label === 'Onboarding') {
      // keep
    } else if (parts[i].length > 12 && /^[a-f0-9-]{8,}$/i.test(parts[i])) {
      label = '#' + parts[i].slice(0, 6);
    }
    out.push({ href: acc, label });
  }
  return out;
}
