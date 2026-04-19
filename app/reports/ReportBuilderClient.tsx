'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CATEGORIES, type CategorySlug, type ItemFilters, type ItemStatus } from '@/lib/types';

interface SelectOption { id: string; name: string }
interface Props {
  currency: string;
  locations: SelectOption[];
  collections: SelectOption[];
  tags: SelectOption[];
}

const STATUSES: ItemStatus[] = ['active', 'sold', 'disposed', 'lost', 'review'];

export function ReportBuilderClient({ locations, collections, tags }: Props) {
  const router = useRouter();
  const [name, setName] = useState(`Inventory ${new Date().toISOString().slice(0, 10)}`);
  const [filters, setFilters] = useState<ItemFilters>({ status: 'active' });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ pdf_url?: string | null; csv_url?: string | null; item_count?: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formats, setFormats] = useState<('pdf' | 'csv')[]>(['pdf', 'csv']);

  function setF<K extends keyof ItemFilters>(key: K, value: ItemFilters[K] | undefined) {
    setFilters((p) => ({ ...p, [key]: value }));
  }

  async function generate() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, filters, formats }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Generate failed');
      setResult(json);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card p-5 space-y-4">
      <div>
        <label className="label">Report name</label>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Category">
          <select className="input" value={filters.category ?? ''} onChange={(e) => setF('category', e.target.value as CategorySlug || undefined)}>
            <option value="">All</option>
            {CATEGORIES.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Status">
          <select className="input" value={filters.status ?? ''} onChange={(e) => setF('status', (e.target.value as ItemStatus) || undefined)}>
            <option value="">Any</option>
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </Field>
        <Field label="Location">
          <select className="input" value={filters.location_id ?? ''} onChange={(e) => setF('location_id', e.target.value || undefined)}>
            <option value="">Any</option>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </Field>
        <Field label="Collection">
          <select className="input" value={filters.collection_id ?? ''} onChange={(e) => setF('collection_id', e.target.value || undefined)}>
            <option value="">Any</option>
            {collections.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Tag">
          <select className="input" value={filters.tag_id ?? ''} onChange={(e) => setF('tag_id', e.target.value || undefined)}>
            <option value="">Any</option>
            {tags.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </Field>
        <Field label="Min value">
          <input
            type="number"
            className="input"
            value={filters.min_value ?? ''}
            onChange={(e) => setF('min_value', e.target.value ? Number(e.target.value) : undefined)}
          />
        </Field>
      </div>

      <div className="flex items-center gap-4 text-sm">
        <span>Formats:</span>
        {(['pdf', 'csv'] as const).map((f) => (
          <label key={f} className="flex items-center gap-1">
            <input
              type="checkbox"
              checked={formats.includes(f)}
              onChange={(e) =>
                setFormats((arr) => (e.target.checked ? Array.from(new Set([...arr, f])) : arr.filter((x) => x !== f)))
              }
            />
            {f.toUpperCase()}
          </label>
        ))}
      </div>

      <button className="btn-primary" onClick={generate} disabled={busy || formats.length === 0}>
        {busy ? 'Generating...' : 'Generate report'}
      </button>

      {error && <div className="text-sm text-red-300">{error}</div>}
      {result && (
        <div className="bg-brand-800/40 rounded p-3 text-sm space-y-1">
          <div>Generated {result.item_count} items.</div>
          <div className="flex gap-3">
            {result.pdf_url && <a href={result.pdf_url} target="_blank" rel="noreferrer" className="text-accent">Download PDF</a>}
            {result.csv_url && <a href={result.csv_url} target="_blank" rel="noreferrer" className="text-accent">Download CSV</a>}
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
    </label>
  );
}
