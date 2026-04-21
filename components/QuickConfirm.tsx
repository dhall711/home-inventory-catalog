'use client';

import { useMemo, useState } from 'react';
import { CATEGORIES, type AIExtractedItem, type CategorySlug } from '@/lib/types';
import type { ItemExtrasState } from '@/lib/item-extras';
import { ItemExtrasPanel } from './ItemExtrasPanel';
import type { ItemSnapshot } from './DocumentApplyDialog';

interface SelectOption { id: string; name: string }

interface Props {
  prefill: AIExtractedItem | null;
  photoUrl: string | null;
  photoThumbUrl: string | null;
  locations: SelectOption[];
  initialLocationId?: string;
  initialCollectionId?: string;
  /** Controlled extras state, lifted to the page so it survives a switch
   *  to the "Add more details" view. */
  extras: ItemExtrasState;
  setExtras: React.Dispatch<React.SetStateAction<ItemExtrasState>>;
  /** Performs the POST /api/items + extras linking. The page owns this
   *  so the same logic is shared with the full Details form. */
  onSubmit: (
    coreFields: {
      name: string;
      category: CategorySlug;
      current_value: string;
      location_id: string;
    },
    then: 'add_another' | 'done'
  ) => Promise<void>;
  onMoreDetails: (draft: QuickDraft) => void;
}

export interface QuickDraft {
  name: string;
  category: CategorySlug;
  current_value: string;
  location_id: string;
}

/**
 * Mobile-first 4-field confirm screen used after AI prefill on a fresh photo.
 * Captures only what an insurance schedule actually needs: what is it, where is
 * it, and what's it worth. Anything else is one tap away via "Add more details".
 *
 * Extras (additional photos, documents, AI-extracted overrides) live in the
 * parent so they survive the toggle to the full details form.
 */
export function QuickConfirm({
  prefill,
  photoUrl,
  photoThumbUrl,
  locations,
  initialLocationId,
  extras,
  setExtras,
  onSubmit,
  onMoreDetails,
}: Props) {
  const [name, setName] = useState(prefill?.name ?? '');
  const [category, setCategory] = useState<CategorySlug>((prefill?.category ?? 'other') as CategorySlug);
  const [currentValue, setCurrentValue] = useState(
    prefill?.estimated_value != null ? String(prefill.estimated_value) : ''
  );
  const [locationId, setLocationId] = useState(initialLocationId ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const txt = (v: unknown): string | null => {
    if (v == null) return null;
    const s = typeof v === 'string' ? v : String(v);
    const t = s.trim();
    if (!t) return null;
    if (/^(unknown|n\/a|none|null|undefined)$/i.test(t)) return null;
    return t;
  };
  const num = (v: unknown): number | null => {
    if (v == null || v === '') return null;
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const date = (v: unknown): string | null => {
    const t = txt(v);
    if (t == null) return null;
    return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : null;
  };

  const currentSnapshot = useMemo<ItemSnapshot>(() => {
    const fromExtra = (key: string): unknown => extras.extraDraft[key];
    return {
      acquired_date: (fromExtra('acquired_date') as string | null) ?? date(prefill?.acquired_date) ?? null,
      acquired_from: (fromExtra('acquired_from') as string | null) ?? null,
      acquired_price:
        (fromExtra('acquired_price') as number | null) ?? num(prefill?.acquired_price) ?? null,
      current_value: currentValue ? num(currentValue) : null,
      manufacturer: (fromExtra('manufacturer') as string | null) ?? txt(prefill?.manufacturer) ?? null,
      model: (fromExtra('model') as string | null) ?? txt(prefill?.model) ?? null,
      serial_number: (fromExtra('serial_number') as string | null) ?? txt(prefill?.serial_number) ?? null,
      notes: (fromExtra('notes') as string | null) ?? null,
      description: (fromExtra('description') as string | null) ?? txt(prefill?.description) ?? null,
      condition: (fromExtra('condition') as string | null) ?? txt(prefill?.condition) ?? null,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [extras.extraDraft, currentValue, prefill]);

  async function save(then: 'add_another' | 'done') {
    setError(null);
    if (!name.trim()) {
      setError('Name is required.');
      return;
    }
    if (extras.pendingDocs.some((d) => d.status === 'extracting')) {
      setError('Still reading documents — please wait a moment.');
      return;
    }
    if (extras.pendingPhotos.some((p) => p.status === 'uploading')) {
      setError('Still uploading photos — please wait a moment.');
      return;
    }
    setBusy(true);
    try {
      await onSubmit(
        { name: name.trim(), category, current_value: currentValue, location_id: locationId },
        then
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card p-5 max-w-2xl space-y-5">
      {error && (
        <div className="bg-red-900/30 border border-red-800/50 rounded-md p-3 text-sm text-red-200">{error}</div>
      )}

      <div className="grid sm:grid-cols-[160px_1fr] gap-4">
        <div className="aspect-square rounded-lg bg-brand-950 overflow-hidden border border-brand-800">
          {photoUrl ? (
            <img src={photoThumbUrl ?? photoUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="h-full flex items-center justify-center text-brand-400 text-sm">No photo</div>
          )}
        </div>
        <div className="space-y-3">
          <div>
            <label className="label">Name *</label>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              placeholder="e.g. Tiffany Sterling Silver Vase"
            />
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="label">Category</label>
              <select
                className="input"
                value={category}
                onChange={(e) => setCategory(e.target.value as CategorySlug)}
              >
                {CATEGORIES.map((c) => (
                  <option key={c.slug} value={c.slug}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">
                Current value
                {prefill?.estimated_value != null && !extras.pendingDocs.some((d) => d.status === 'applied') && (
                  <span className="ml-1 text-xs text-brand-400">(AI estimate)</span>
                )}
              </label>
              <input
                type="number"
                step="0.01"
                inputMode="decimal"
                className="input"
                value={currentValue}
                onChange={(e) => setCurrentValue(e.target.value)}
                placeholder="0.00"
              />
            </div>
          </div>
          <div>
            <label className="label">Location</label>
            <select className="input" value={locationId} onChange={(e) => setLocationId(e.target.value)}>
              <option value="">— Choose later</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {prefill?.estimated_value_reasoning && (
        <p className="text-xs text-brand-400 italic">AI: {prefill.estimated_value_reasoning}</p>
      )}

      <div className="pt-3 border-t border-brand-800">
        <ItemExtrasPanel
          extras={extras}
          setExtras={setExtras}
          currentSnapshot={currentSnapshot}
          context={{ name: name.trim() || prefill?.name || null, category }}
          onCurrentValueApplied={(v) => setCurrentValue(String(v))}
          busy={busy}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-brand-800">
        <button className="btn-primary" disabled={busy} onClick={() => save('done')}>
          {busy ? 'Saving...' : 'Save'}
        </button>
        <button className="btn-secondary" disabled={busy} onClick={() => save('add_another')}>
          Save & add another
        </button>
        <button
          className="btn-ghost ml-auto"
          disabled={busy}
          onClick={() =>
            onMoreDetails({ name, category, current_value: currentValue, location_id: locationId })
          }
        >
          Add more details →
        </button>
      </div>
    </div>
  );
}
