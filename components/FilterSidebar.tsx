'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { CATEGORIES, type CategorySlug, type ItemStatus, type SortOption } from '@/lib/types';
import { useCallback } from 'react';

export interface SidebarOption {
  id: string;
  name: string;
}

interface Props {
  locations: SidebarOption[];
  collections: SidebarOption[];
  tags: SidebarOption[];
  totalCount: number;
}

const STATUSES: ItemStatus[] = ['active', 'sold', 'disposed', 'lost', 'review'];
const SORTS: { value: SortOption; label: string }[] = [
  { value: 'updated_desc', label: 'Recently updated' },
  { value: 'created_desc', label: 'Recently added' },
  { value: 'name_asc', label: 'Name (A-Z)' },
  { value: 'value_desc', label: 'Value (high to low)' },
  { value: 'value_asc', label: 'Value (low to high)' },
  { value: 'acquired_desc', label: 'Newest acquired' },
];

export function FilterSidebar({ locations, collections, tags, totalCount }: Props) {
  const router = useRouter();
  const sp = useSearchParams();

  const setParam = useCallback(
    (key: string, value: string | null) => {
      const params = new URLSearchParams(sp?.toString() ?? '');
      if (value === null || value === '') params.delete(key);
      else params.set(key, value);
      params.delete('page');
      router.push(`/items?${params.toString()}`);
    },
    [router, sp]
  );

  const get = (k: string) => sp?.get(k) ?? '';

  return (
    <aside className="card p-4 space-y-5 lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto">
      <div>
        <div className="text-xs uppercase tracking-wider text-brand-300 mb-2">
          {totalCount.toLocaleString()} items
        </div>
        <input
          className="input"
          placeholder="Search name, serial, notes..."
          defaultValue={get('q')}
          onKeyDown={(e) => {
            if (e.key === 'Enter') setParam('q', (e.target as HTMLInputElement).value);
          }}
        />
      </div>

      <FilterSection title="Sort">
        <select className="input" value={get('sort') || 'updated_desc'} onChange={(e) => setParam('sort', e.target.value)}>
          {SORTS.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      </FilterSection>

      <FilterSection title="Category">
        <select className="input" value={get('category')} onChange={(e) => setParam('category', e.target.value)}>
          <option value="">All categories</option>
          {CATEGORIES.map((c) => (
            <option key={c.slug} value={c.slug}>{c.name}</option>
          ))}
        </select>
      </FilterSection>

      <FilterSection title="Location">
        <select className="input" value={get('location_id')} onChange={(e) => setParam('location_id', e.target.value)}>
          <option value="">Any location</option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>{l.name}</option>
          ))}
        </select>
      </FilterSection>

      <FilterSection title="Collection">
        <select className="input" value={get('collection_id')} onChange={(e) => setParam('collection_id', e.target.value)}>
          <option value="">Any collection</option>
          {collections.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </FilterSection>

      <FilterSection title="Tag">
        <select className="input" value={get('tag_id')} onChange={(e) => setParam('tag_id', e.target.value)}>
          <option value="">Any tag</option>
          {tags.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      </FilterSection>

      <FilterSection title="Status">
        <select className="input" value={get('status')} onChange={(e) => setParam('status', e.target.value)}>
          <option value="">Any status</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </FilterSection>

      <FilterSection title="Value">
        <div className="grid grid-cols-2 gap-2">
          <input
            type="number"
            className="input"
            placeholder="Min"
            defaultValue={get('min_value')}
            onBlur={(e) => setParam('min_value', e.target.value)}
          />
          <input
            type="number"
            className="input"
            placeholder="Max"
            defaultValue={get('max_value')}
            onBlur={(e) => setParam('max_value', e.target.value)}
          />
        </div>
      </FilterSection>

      <label className="flex items-center gap-2 text-sm text-brand-200">
        <input
          type="checkbox"
          checked={get('has_serial') === 'true'}
          onChange={(e) => setParam('has_serial', e.target.checked ? 'true' : null)}
        />
        Has serial number
      </label>

      <button
        type="button"
        className="btn-ghost w-full"
        onClick={() => router.push('/items')}
      >
        Clear filters
      </button>
    </aside>
  );
}

function FilterSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wider text-brand-300 mb-1">{title}</div>
      {children}
    </div>
  );
}

export function getCategorySlug(value: string | null): CategorySlug | undefined {
  if (!value) return undefined;
  const found = CATEGORIES.find((c) => c.slug === value);
  return found?.slug;
}
