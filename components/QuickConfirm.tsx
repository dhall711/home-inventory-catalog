'use client';

import { useState } from 'react';
import { CATEGORIES, type AIExtractedItem, type CategorySlug } from '@/lib/types';

interface SelectOption { id: string; name: string }

interface Props {
  prefill: AIExtractedItem | null;
  photoUrl: string | null;
  photoThumbUrl: string | null;
  locations: SelectOption[];
  initialLocationId?: string;
  initialCollectionId?: string;
  onSaveAndAddAnother: (saved: { id: string }) => void;
  onSaveAndDone: (saved: { id: string }) => void;
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
 */
export function QuickConfirm({
  prefill,
  photoUrl,
  photoThumbUrl,
  locations,
  initialLocationId,
  initialCollectionId,
  onSaveAndAddAnother,
  onSaveAndDone,
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

  async function save(then: 'add_another' | 'done') {
    setError(null);
    if (!name.trim()) {
      setError('Name is required.');
      return;
    }
    setBusy(true);
    try {
      const valueNum = currentValue ? Number(currentValue) : null;
      const payload = {
        name: name.trim(),
        category,
        current_value: valueNum,
        current_value_source: valueNum ? (prefill?.estimated_value ? 'ai' : 'manual') : null,
        current_value_updated_at: valueNum ? new Date().toISOString() : null,
        location_id: locationId || null,
        collection_id: initialCollectionId || null,
        primary_photo_url: photoUrl || null,
        primary_photo_thumb_url: photoThumbUrl || null,
        // Carry the rest of the AI draft so nothing's lost when the user
        // skips the detail form: description, manufacturer, model, etc.
        description: prefill?.description ?? null,
        manufacturer: prefill?.manufacturer ?? null,
        model: prefill?.model ?? null,
        serial_number: prefill?.serial_number ?? null,
        condition: prefill?.condition ?? null,
        acquired_date: prefill?.acquired_date ?? null,
        acquired_price: prefill?.acquired_price ?? null,
        ai_raw_json: prefill ?? null,
        ai_confidence: prefill?.confidence ?? null,
        attributes: prefill?.attributes ?? {},
        ...(valueNum ? { initial_value: valueNum } : {}),
      };
      const res = await fetch('/api/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Save failed');
      const saved = json.item as { id: string };
      if (then === 'add_another') onSaveAndAddAnother(saved);
      else onSaveAndDone(saved);
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
                {prefill?.estimated_value != null && (
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
