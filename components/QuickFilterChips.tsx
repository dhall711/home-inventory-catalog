'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';

const SEVEN_DAYS_AGO = () => {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return d.toISOString().slice(0, 10);
};

const QUICK_FILTERS = [
  { key: 'needs_review', label: 'Needs review', value: 'true' },
  { key: 'min_value', label: 'High value $1k+', value: '1000' },
  { key: 'added_from', label: 'Added in last 7 days', value: SEVEN_DAYS_AGO },
  { key: 'missing_photo', label: 'No photo', value: 'true' },
  { key: 'missing_value', label: 'No value', value: 'true' },
  { key: 'missing_serial', label: 'No serial #', value: 'true' },
] as const;

/**
 * One-tap chips above the items list. Each chip toggles a single filter on/off
 * by mutating the URL. They're intentionally redundant with the FilterSidebar
 * for the most common filter intents.
 */
export function QuickFilterChips() {
  const router = useRouter();
  const sp = useSearchParams();

  function applyToggle(key: string, value: string) {
    const params = new URLSearchParams(sp?.toString() ?? '');
    if (params.get(key) === value) {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    params.delete('page');
    router.push(`/items?${params.toString()}`);
  }

  const isActive = (key: string, value: string) => sp?.get(key) === value;
  const hasAny = sp && Array.from(sp.keys()).some((k) => k !== 'sort' && k !== 'page' && sp.get(k));

  return (
    <div className="flex flex-wrap items-center gap-2">
      {QUICK_FILTERS.map((q) => {
        const value = typeof q.value === 'function' ? q.value() : q.value;
        const active = isActive(q.key, value);
        return (
          <button
            key={q.key}
            type="button"
            onClick={() => applyToggle(q.key, value)}
            className={`text-xs rounded-full border px-3 py-1 transition-colors ${
              active
                ? 'bg-brand-500 border-brand-400 text-white'
                : 'border-brand-700 text-brand-200 hover:bg-brand-800'
            }`}
          >
            {q.label}
          </button>
        );
      })}
      {hasAny && (
        <Link href="/items" className="ml-1 text-xs text-brand-400 hover:text-brand-100 underline">
          Clear all
        </Link>
      )}
    </div>
  );
}
