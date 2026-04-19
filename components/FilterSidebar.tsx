'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { CATEGORIES, type CategorySlug, type ItemStatus, type SortOption } from '@/lib/types';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

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

const QUALITY_FLAGS: { key: string; label: string }[] = [
  { key: 'has_photo', label: 'Has photo' },
  { key: 'missing_photo', label: 'Missing photo' },
  { key: 'has_serial', label: 'Has serial #' },
  { key: 'missing_serial', label: 'Missing serial #' },
  { key: 'missing_value', label: 'Missing value' },
  { key: 'needs_review', label: 'Needs review' },
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

  /**
   * Toggle one value in a comma-separated multi-value param.
   * We keep the URL human-friendly with comma joining instead of repeated keys.
   */
  const toggleMulti = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(sp?.toString() ?? '');
      const existing = (params.get(key) ?? '').split(',').map((v) => v.trim()).filter(Boolean);
      const next = existing.includes(value)
        ? existing.filter((v) => v !== value)
        : [...existing, value];
      if (next.length === 0) params.delete(key);
      else params.set(key, next.join(','));
      params.delete('page');
      router.push(`/items?${params.toString()}`);
    },
    [router, sp]
  );

  const get = (k: string) => sp?.get(k) ?? '';
  const getMulti = (k: string) =>
    (sp?.get(k) ?? '').split(',').map((v) => v.trim()).filter(Boolean);

  // 300ms-debounced live search.
  const [search, setSearch] = useState(get('q'));
  const initialQRef = useRef(get('q'));
  useEffect(() => {
    if (search === initialQRef.current) return;
    const t = setTimeout(() => {
      setParam('q', search || null);
      initialQRef.current = search;
    }, 300);
    return () => clearTimeout(t);
  }, [search, setParam]);
  // Keep search in sync if URL changes externally (e.g. clearing filters).
  useEffect(() => {
    const next = sp?.get('q') ?? '';
    if (next !== initialQRef.current) {
      initialQRef.current = next;
      setSearch(next);
    }
  }, [sp]);

  const selectedCategories = useMemo(() => new Set(getMulti('category')), [sp]);
  const selectedLocations = useMemo(() => new Set(getMulti('location_id')), [sp]);
  const selectedCollections = useMemo(() => new Set(getMulti('collection_id')), [sp]);
  const selectedTags = useMemo(() => new Set(getMulti('tag_id')), [sp]);

  return (
    <aside className="card p-4 space-y-5 lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto">
      <div>
        <div className="text-xs uppercase tracking-wider text-brand-300 mb-2">
          {totalCount.toLocaleString()} items
        </div>
        <input
          className="input"
          placeholder="Search name, serial, notes..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <FilterSection title="Sort">
        <select className="input" value={get('sort') || 'updated_desc'} onChange={(e) => setParam('sort', e.target.value)}>
          {SORTS.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      </FilterSection>

      <ChipGroup title="Category">
        {CATEGORIES.map((c) => (
          <Chip
            key={c.slug}
            label={c.name}
            active={selectedCategories.has(c.slug)}
            onClick={() => toggleMulti('category', c.slug)}
          />
        ))}
      </ChipGroup>

      {locations.length > 0 && (
        <ChipGroup title="Locations">
          {locations.map((l) => (
            <Chip
              key={l.id}
              label={l.name}
              active={selectedLocations.has(l.id)}
              onClick={() => toggleMulti('location_id', l.id)}
            />
          ))}
        </ChipGroup>
      )}

      {collections.length > 0 && (
        <ChipGroup title="Collections">
          {collections.map((c) => (
            <Chip
              key={c.id}
              label={c.name}
              active={selectedCollections.has(c.id)}
              onClick={() => toggleMulti('collection_id', c.id)}
            />
          ))}
        </ChipGroup>
      )}

      {tags.length > 0 && (
        <ChipGroup title="Tags">
          {tags.map((t) => (
            <Chip
              key={t.id}
              label={t.name}
              active={selectedTags.has(t.id)}
              onClick={() => toggleMulti('tag_id', t.id)}
            />
          ))}
        </ChipGroup>
      )}

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
            key={`min-${get('min_value')}`}
          />
          <input
            type="number"
            className="input"
            placeholder="Max"
            defaultValue={get('max_value')}
            onBlur={(e) => setParam('max_value', e.target.value)}
            key={`max-${get('max_value')}`}
          />
        </div>
      </FilterSection>

      <FilterSection title="Acquired">
        <div className="grid grid-cols-2 gap-2">
          <input
            type="date"
            className="input"
            defaultValue={get('acquired_from')}
            onChange={(e) => setParam('acquired_from', e.target.value)}
            key={`acq-from-${get('acquired_from')}`}
          />
          <input
            type="date"
            className="input"
            defaultValue={get('acquired_to')}
            onChange={(e) => setParam('acquired_to', e.target.value)}
            key={`acq-to-${get('acquired_to')}`}
          />
        </div>
      </FilterSection>

      <FilterSection title="Added">
        <div className="grid grid-cols-2 gap-2">
          <input
            type="date"
            className="input"
            defaultValue={get('added_from')}
            onChange={(e) => setParam('added_from', e.target.value)}
            key={`add-from-${get('added_from')}`}
          />
          <input
            type="date"
            className="input"
            defaultValue={get('added_to')}
            onChange={(e) => setParam('added_to', e.target.value)}
            key={`add-to-${get('added_to')}`}
          />
        </div>
      </FilterSection>

      <ChipGroup title="Quality">
        {QUALITY_FLAGS.map((f) => (
          <Chip
            key={f.key}
            label={f.label}
            active={get(f.key) === 'true'}
            onClick={() => setParam(f.key, get(f.key) === 'true' ? null : 'true')}
          />
        ))}
      </ChipGroup>

      <SaveCurrentFilter />

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

function SaveCurrentFilter() {
  const router = useRouter();
  const sp = useSearchParams();
  const qs = sp?.toString() ?? '';
  // Don't bother showing the save button when nothing is filtered.
  const hasFilters = qs.length > 0 && Array.from(sp?.keys() ?? []).some((k) => k !== 'sort' && k !== 'page');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  if (!hasFilters) return null;

  return (
    <div className="space-y-1">
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          const name = window.prompt('Name this saved search:');
          if (!name) return;
          setBusy(true);
          setMsg(null);
          try {
            const res = await fetch('/api/saved-searches', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ name: name.trim(), query_string: qs }),
            });
            if (!res.ok) {
              const j = await res.json().catch(() => ({}));
              throw new Error(j.error || `Failed (${res.status})`);
            }
            setMsg('Saved!');
            router.refresh();
          } catch (e) {
            setMsg(e instanceof Error ? e.message : 'Failed to save');
          } finally {
            setBusy(false);
            setTimeout(() => setMsg(null), 2500);
          }
        }}
        className="btn-secondary w-full text-xs"
      >
        {busy ? 'Saving...' : '★ Save current filter'}
      </button>
      {msg && <div className="text-[11px] text-brand-300 text-center">{msg}</div>}
    </div>
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

function ChipGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wider text-brand-300 mb-2">{title}</div>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function Chip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-xs rounded-full border px-2.5 py-1 transition-colors ${
        active
          ? 'bg-brand-500 border-brand-400 text-white'
          : 'border-brand-700 text-brand-200 hover:bg-brand-800'
      }`}
    >
      {label}
    </button>
  );
}

export function getCategorySlug(value: string | null): CategorySlug | undefined {
  if (!value) return undefined;
  const found = CATEGORIES.find((c) => c.slug === value);
  return found?.slug;
}
