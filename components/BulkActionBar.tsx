'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CATEGORIES, type CategorySlug, type ItemStatus } from '@/lib/types';

interface SelectOption { id: string; name: string }

interface Props {
  selectedIds: string[];
  locations: SelectOption[];
  collections: SelectOption[];
  onClear: () => void;
}

const STATUSES: ItemStatus[] = ['active', 'sold', 'disposed', 'lost', 'review'];

type Mode = 'idle' | 'location' | 'collection' | 'category' | 'tags' | 'status' | 'delete';

export function BulkActionBar({ selectedIds, locations, collections, onClear }: Props) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('idle');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [locationId, setLocationId] = useState<string>('');
  const [collectionId, setCollectionId] = useState<string>('');
  const [category, setCategory] = useState<CategorySlug>('other');
  const [status, setStatus] = useState<ItemStatus>('active');
  const [tagsText, setTagsText] = useState('');

  if (selectedIds.length === 0) return null;

  async function call(action: string, extra: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/items/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_ids: selectedIds, action, ...extra }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Bulk action failed');
      onClear();
      setMode('idle');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed bottom-3 inset-x-3 z-40 lg:left-auto lg:right-6 lg:max-w-3xl mx-auto">
      <div className="card border-brand-600 bg-brand-900/95 backdrop-blur shadow-xl p-3 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">{selectedIds.length} selected</span>
          <div className="ml-auto flex flex-wrap gap-1.5">
            <ActionButton label="Move location" active={mode === 'location'} onClick={() => setMode(mode === 'location' ? 'idle' : 'location')} />
            <ActionButton label="Move collection" active={mode === 'collection'} onClick={() => setMode(mode === 'collection' ? 'idle' : 'collection')} />
            <ActionButton label="Category" active={mode === 'category'} onClick={() => setMode(mode === 'category' ? 'idle' : 'category')} />
            <ActionButton label="Add tags" active={mode === 'tags'} onClick={() => setMode(mode === 'tags' ? 'idle' : 'tags')} />
            <ActionButton label="Status" active={mode === 'status'} onClick={() => setMode(mode === 'status' ? 'idle' : 'status')} />
            <ActionButton label="Delete" active={mode === 'delete'} danger onClick={() => setMode(mode === 'delete' ? 'idle' : 'delete')} />
            <button className="btn-ghost text-xs px-2" onClick={onClear}>Clear</button>
          </div>
        </div>

        {error && (
          <div className="text-xs text-red-300 bg-red-900/30 border border-red-800 rounded p-2">{error}</div>
        )}

        {mode === 'location' && (
          <Row>
            <select className="input flex-1" value={locationId} onChange={(e) => setLocationId(e.target.value)}>
              <option value="">— No location</option>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
            <button className="btn-primary" disabled={busy} onClick={() => call('move_location', { location_id: locationId || null })}>
              Apply
            </button>
          </Row>
        )}

        {mode === 'collection' && (
          <Row>
            <select className="input flex-1" value={collectionId} onChange={(e) => setCollectionId(e.target.value)}>
              <option value="">— No collection</option>
              {collections.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <button className="btn-primary" disabled={busy} onClick={() => call('move_collection', { collection_id: collectionId || null })}>
              Apply
            </button>
          </Row>
        )}

        {mode === 'category' && (
          <div className="space-y-2">
            <p className="text-xs text-amber-300">
              Heads up: changing category hides any per-category attributes the item already has
              (artist, movement, etc.). The values stay in the database in case you change back.
            </p>
            <Row>
              <select className="input flex-1" value={category} onChange={(e) => setCategory(e.target.value as CategorySlug)}>
                {CATEGORIES.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
              </select>
              <button className="btn-primary" disabled={busy} onClick={() => call('change_category', { category })}>
                Apply
              </button>
            </Row>
          </div>
        )}

        {mode === 'tags' && (
          <Row>
            <input
              className="input flex-1"
              placeholder="comma,separated,tags"
              value={tagsText}
              onChange={(e) => setTagsText(e.target.value)}
            />
            <button
              className="btn-primary"
              disabled={busy || !tagsText.trim()}
              onClick={() => call('add_tags', { tag_names: tagsText.split(',').map((t) => t.trim()).filter(Boolean) })}
            >
              Apply
            </button>
          </Row>
        )}

        {mode === 'status' && (
          <Row>
            <select className="input flex-1" value={status} onChange={(e) => setStatus(e.target.value as ItemStatus)}>
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <button className="btn-primary" disabled={busy} onClick={() => call('change_status', { status })}>
              Apply
            </button>
          </Row>
        )}

        {mode === 'delete' && (
          <div className="space-y-2">
            <p className="text-xs text-red-300">
              Permanently delete {selectedIds.length} item{selectedIds.length === 1 ? '' : 's'}? This cannot be undone.
            </p>
            <Row>
              <button className="btn-ghost flex-1" onClick={() => setMode('idle')}>Cancel</button>
              <button
                className="btn-primary bg-red-700 hover:bg-red-600 border-red-800"
                disabled={busy}
                onClick={() => call('delete', {})}
              >
                Yes, delete
              </button>
            </Row>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center gap-2">{children}</div>;
}

function ActionButton({ label, active, onClick, danger }: { label: string; active: boolean; onClick: () => void; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-xs rounded-md px-2 py-1 border transition-colors ${
        active
          ? danger
            ? 'bg-red-700 border-red-600 text-white'
            : 'bg-brand-700 border-brand-600 text-white'
          : danger
          ? 'border-red-900/60 text-red-300 hover:bg-red-900/30'
          : 'border-brand-700 text-brand-200 hover:bg-brand-800'
      }`}
    >
      {label}
    </button>
  );
}
