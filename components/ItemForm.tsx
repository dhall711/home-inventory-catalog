'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  CATEGORIES,
  CATEGORY_ATTRIBUTES,
  type AIExtractedItem,
  type AttributeField,
  type CategorySlug,
  type Item,
  type ItemStatus,
  type ValueSource,
} from '@/lib/types';

interface SelectOption { id: string; name: string }

interface Props {
  mode: 'create' | 'edit';
  item?: Item;
  attributes?: Record<string, unknown> | null;
  initialTags?: string[];
  initialPhotoUrl?: string | null;
  initialPhotoThumbUrl?: string | null;
  locations: SelectOption[];
  collections: SelectOption[];
  allTags: SelectOption[];
  prefill?: AIExtractedItem | null;
  initialCollectionId?: string;
  initialLocationId?: string;
  /**
   * In create mode, when provided, replaces the default POST /api/items
   * call so the parent can merge in queued extras (additional photos,
   * documents, AI-extracted overrides) and link them after the row is
   * created. The parent is responsible for navigation after save.
   */
  onCreate?: (payload: Record<string, unknown>) => Promise<void>;
  /** Optional render slot below the action buttons (e.g. queued-extras panel). */
  footerSlot?: React.ReactNode;
}

const STATUSES: ItemStatus[] = ['active', 'sold', 'disposed', 'lost', 'review'];
const VALUE_SOURCES: ValueSource[] = ['manual', 'ai', 'appraisal', 'receipt'];

export function ItemForm({
  mode,
  item,
  attributes,
  initialTags,
  initialPhotoUrl,
  initialPhotoThumbUrl,
  locations,
  collections,
  allTags,
  prefill,
  initialCollectionId,
  initialLocationId,
  onCreate,
  footerSlot,
}: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [category, setCategory] = useState<CategorySlug>(
    (item?.category ?? prefill?.category ?? 'other') as CategorySlug
  );
  const [name, setName] = useState(item?.name ?? prefill?.name ?? '');
  const [description, setDescription] = useState(item?.description ?? prefill?.description ?? '');
  const [manufacturer, setManufacturer] = useState(item?.manufacturer ?? prefill?.manufacturer ?? '');
  const [model, setModel] = useState(item?.model ?? prefill?.model ?? '');
  const [serialNumber, setSerialNumber] = useState(item?.serial_number ?? prefill?.serial_number ?? '');
  const [condition, setCondition] = useState(item?.condition ?? prefill?.condition ?? '');
  const [status, setStatus] = useState<ItemStatus>(item?.status ?? 'active');
  const [locationId, setLocationId] = useState(item?.location_id ?? initialLocationId ?? '');
  const [collectionId, setCollectionId] = useState(item?.collection_id ?? initialCollectionId ?? '');
  const [acquiredDate, setAcquiredDate] = useState(item?.acquired_date ?? prefill?.acquired_date ?? '');
  const [acquiredFrom, setAcquiredFrom] = useState(item?.acquired_from ?? '');
  const [acquiredPrice, setAcquiredPrice] = useState(
    item?.acquired_price?.toString() ?? prefill?.acquired_price?.toString() ?? ''
  );
  const [currentValue, setCurrentValue] = useState(
    item?.current_value?.toString() ?? prefill?.estimated_value?.toString() ?? ''
  );
  const [currentValueSource, setCurrentValueSource] = useState<ValueSource>(
    item?.current_value_source ?? (prefill?.estimated_value ? 'ai' : 'manual')
  );
  const [notes, setNotes] = useState(item?.notes ?? '');
  const [tags, setTags] = useState<string>(initialTags?.join(', ') ?? '');
  const [photoUrl, setPhotoUrl] = useState(initialPhotoUrl ?? item?.primary_photo_url ?? '');
  const [photoThumbUrl, setPhotoThumbUrl] = useState(initialPhotoThumbUrl ?? item?.primary_photo_thumb_url ?? '');
  const [uploading, setUploading] = useState(false);

  // Free-form key/value pairs persisted to items.custom_attributes JSONB.
  // Combine values from the existing item, AI prefill, and let the user
  // edit/add/remove rows. Each row keeps its own id so React can track it.
  const initialCustom: Array<{ id: string; key: string; value: string }> = useMemo(() => {
    const merged: Record<string, string> = {};
    if (item?.custom_attributes) {
      for (const [k, v] of Object.entries(item.custom_attributes)) {
        if (v != null) merged[k] = String(v);
      }
    }
    const fromPrefill = (prefill as { custom_attributes?: Record<string, unknown> } | null | undefined)?.custom_attributes;
    if (fromPrefill) {
      for (const [k, v] of Object.entries(fromPrefill)) {
        if (v != null && !(k in merged)) merged[k] = String(v);
      }
    }
    return Object.entries(merged).map(([key, value], i) => ({
      id: `init-${i}`,
      key,
      value,
    }));
  }, [item, prefill]);
  const [customRows, setCustomRows] = useState(initialCustom);
  const [customCounter, setCustomCounter] = useState(initialCustom.length);

  const fields: AttributeField[] = useMemo(() => CATEGORY_ATTRIBUTES[category] ?? [], [category]);
  const [attrValues, setAttrValues] = useState<Record<string, string | boolean>>(() => {
    const initial: Record<string, string | boolean> = {};
    for (const f of CATEGORY_ATTRIBUTES[(item?.category ?? prefill?.category ?? 'other') as CategorySlug] ?? []) {
      const fromAttr = attributes?.[f.key];
      const fromPrefill = prefill?.attributes?.[f.key];
      const v = fromAttr ?? fromPrefill;
      if (v == null) {
        initial[f.key] = f.type === 'boolean' ? false : '';
      } else if (f.type === 'boolean') {
        initial[f.key] = Boolean(v);
      } else {
        initial[f.key] = String(v);
      }
    }
    return initial;
  });

  useEffect(() => {
    setAttrValues((prev) => {
      const next: Record<string, string | boolean> = {};
      for (const f of fields) {
        next[f.key] = prev[f.key] ?? (f.type === 'boolean' ? false : '');
      }
      return next;
    });
  }, [fields]);

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/upload/photo', { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Upload failed');
      setPhotoUrl(json.url);
      setPhotoThumbUrl(json.thumb_url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const cleanedAttrs: Record<string, unknown> = {};
    for (const f of fields) {
      const v = attrValues[f.key];
      if (f.type === 'boolean') cleanedAttrs[f.key] = Boolean(v);
      else if (v === '' || v == null) cleanedAttrs[f.key] = null;
      else if (f.type === 'number') cleanedAttrs[f.key] = Number(v);
      else cleanedAttrs[f.key] = v;
    }

    const cleanedCustom: Record<string, string> = {};
    for (const row of customRows) {
      const k = row.key.trim();
      const v = row.value.trim();
      if (k && v) cleanedCustom[k] = v;
    }

    const payload = {
      category,
      name,
      description: description || null,
      manufacturer: manufacturer || null,
      model: model || null,
      serial_number: serialNumber || null,
      condition: condition || null,
      status,
      location_id: locationId || null,
      collection_id: collectionId || null,
      acquired_date: acquiredDate || null,
      acquired_from: acquiredFrom || null,
      acquired_price: acquiredPrice ? Number(acquiredPrice) : null,
      current_value: currentValue ? Number(currentValue) : null,
      current_value_source: currentValue ? currentValueSource : null,
      current_value_updated_at: currentValue ? new Date().toISOString() : null,
      primary_photo_url: photoUrl || null,
      primary_photo_thumb_url: photoThumbUrl || null,
      notes: notes || null,
      ai_raw_json: prefill ?? null,
      ai_confidence: prefill?.confidence ?? null,
      attributes: cleanedAttrs,
      custom_attributes: cleanedCustom,
      tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
      ...(mode === 'create' && currentValue ? { initial_value: Number(currentValue) } : {}),
    };

    try {
      if (mode === 'create' && onCreate) {
        // Parent handles the POST + extras linking + navigation.
        await onCreate(payload);
        return;
      }
      const url = mode === 'create' ? '/api/items' : `/api/items/${item!.id}`;
      const method = mode === 'create' ? 'POST' : 'PATCH';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Save failed');
      const id = json.item?.id ?? item?.id;
      router.push(`/items/${id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="bg-red-900/30 border border-red-800/50 rounded-md p-3 text-sm text-red-200">{error}</div>
      )}

      <div className="grid lg:grid-cols-[280px_1fr] gap-6">
        <div className="space-y-3">
          <div className="card aspect-square bg-brand-950/40 flex items-center justify-center overflow-hidden">
            {photoUrl ? (
              <img src={photoUrl} alt={name} className="w-full h-full object-cover" />
            ) : (
              <div className="text-brand-400 text-sm">No photo</div>
            )}
          </div>
          <div className="space-y-1">
            <label className="label block">
              {photoUrl ? 'Replace photo (optional)' : 'Add a photo'}
            </label>
            <input
              type="file"
              accept="image/*"
              onChange={handlePhotoUpload}
              disabled={uploading}
              className="text-sm"
            />
            {photoUrl && !uploading && (
              <div className="flex items-center gap-2 text-xs text-brand-300">
                <span className="text-emerald-300">✓ Photo attached</span>
                <button
                  type="button"
                  className="text-brand-400 hover:text-red-300 underline"
                  onClick={() => {
                    setPhotoUrl('');
                    setPhotoThumbUrl('');
                  }}
                >
                  Remove
                </button>
              </div>
            )}
          </div>
          {uploading && <div className="text-xs text-brand-300">Uploading & generating thumbnail...</div>}
          {prefill?.confidence != null && (
            <div className="text-xs text-brand-300">
              AI confidence: {Math.round((prefill.confidence ?? 0) * 100)}%
            </div>
          )}
          {prefill?.estimated_value_reasoning && (
            <div className="text-xs text-brand-300 italic">
              Value estimate basis: {prefill.estimated_value_reasoning}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Name *">
              <input className="input" required value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="Category *">
              <select className="input" value={category} onChange={(e) => setCategory(e.target.value as CategorySlug)}>
                {CATEGORIES.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
              </select>
            </Field>
            <Field label="Manufacturer">
              <input className="input" value={manufacturer} onChange={(e) => setManufacturer(e.target.value)} />
            </Field>
            <Field label="Model">
              <input className="input" value={model} onChange={(e) => setModel(e.target.value)} />
            </Field>
            <Field label="Serial number">
              <input className="input" value={serialNumber} onChange={(e) => setSerialNumber(e.target.value)} />
            </Field>
            <Field label="Condition">
              <input className="input" value={condition} onChange={(e) => setCondition(e.target.value)} placeholder="e.g., Excellent" />
            </Field>
            <Field label="Status">
              <select className="input" value={status} onChange={(e) => setStatus(e.target.value as ItemStatus)}>
                {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Location">
              <select className="input" value={locationId} onChange={(e) => setLocationId(e.target.value)}>
                <option value="">—</option>
                {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </Field>
            <Field label="Collection">
              <select className="input" value={collectionId} onChange={(e) => setCollectionId(e.target.value)}>
                <option value="">—</option>
                {collections.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
            <Field label="Tags (comma separated)">
              <input
                className="input"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                list="tag-suggestions"
                placeholder="e.g., gift, antique, kids-room"
              />
              <datalist id="tag-suggestions">
                {allTags.map((t) => <option key={t.id} value={t.name} />)}
              </datalist>
            </Field>
          </div>

          <Field label="Description">
            <textarea className="input min-h-[80px]" value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>

          <Section title="Acquisition & value" defaultOpen>
            <div className="grid sm:grid-cols-3 gap-3">
              <Field label="Acquired date">
                <input type="date" className="input" value={acquiredDate} onChange={(e) => setAcquiredDate(e.target.value)} />
              </Field>
              <Field label="Acquired from">
                <input className="input" value={acquiredFrom} onChange={(e) => setAcquiredFrom(e.target.value)} />
              </Field>
              <Field label="Acquired price">
                <input type="number" step="0.01" className="input" value={acquiredPrice} onChange={(e) => setAcquiredPrice(e.target.value)} />
              </Field>
              <Field label="Current value">
                <input type="number" step="0.01" className="input" value={currentValue} onChange={(e) => setCurrentValue(e.target.value)} />
              </Field>
              <Field label="Value source">
                <select className="input" value={currentValueSource} onChange={(e) => setCurrentValueSource(e.target.value as ValueSource)}>
                  {VALUE_SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </Field>
            </div>
          </Section>

          {fields.length > 0 && (
            <Section title={`${categoryLabel(category)} details`} defaultOpen={mode === 'edit'}>
              <div className="grid sm:grid-cols-2 gap-3">
                {fields.map((f) => (
                  <Field key={f.key} label={f.label}>
                    {f.type === 'textarea' ? (
                      <textarea
                        className="input min-h-[60px]"
                        value={String(attrValues[f.key] ?? '')}
                        onChange={(e) => setAttrValues((p) => ({ ...p, [f.key]: e.target.value }))}
                      />
                    ) : f.type === 'boolean' ? (
                      <label className="flex items-center gap-2 text-sm h-10">
                        <input
                          type="checkbox"
                          checked={Boolean(attrValues[f.key])}
                          onChange={(e) => setAttrValues((p) => ({ ...p, [f.key]: e.target.checked }))}
                        />
                        <span>{f.label}</span>
                      </label>
                    ) : (
                      <input
                        type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'}
                        className="input"
                        value={String(attrValues[f.key] ?? '')}
                        onChange={(e) => setAttrValues((p) => ({ ...p, [f.key]: e.target.value }))}
                      />
                    )}
                  </Field>
                ))}
              </div>
            </Section>
          )}

          <Section title="Custom fields" defaultOpen={customRows.length > 0}>
            <p className="text-xs text-brand-300">
              Capture anything the typed schema doesn&apos;t cover - e.g. <em>auction lot</em>, <em>display case</em>,
              <em> ribbon color</em>, <em>parent collection</em>. Stored as flexible key/value pairs and searchable.
            </p>
            <div className="space-y-2">
              {customRows.length === 0 && (
                <div className="text-xs text-brand-400 italic">No custom fields yet.</div>
              )}
              {customRows.map((row, idx) => (
                <div key={row.id} className="grid grid-cols-[1fr_2fr_auto] gap-2 items-center">
                  <input
                    className="input"
                    placeholder="Field name"
                    value={row.key}
                    onChange={(e) =>
                      setCustomRows((rows) => rows.map((r, i) => (i === idx ? { ...r, key: e.target.value } : r)))
                    }
                  />
                  <input
                    className="input"
                    placeholder="Value"
                    value={row.value}
                    onChange={(e) =>
                      setCustomRows((rows) => rows.map((r, i) => (i === idx ? { ...r, value: e.target.value } : r)))
                    }
                  />
                  <button
                    type="button"
                    className="btn-ghost text-xs px-2 py-1"
                    onClick={() => setCustomRows((rows) => rows.filter((_, i) => i !== idx))}
                    aria-label="Remove field"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              className="btn-ghost text-xs"
              onClick={() => {
                const id = `new-${customCounter}`;
                setCustomCounter((c) => c + 1);
                setCustomRows((rows) => [...rows, { id, key: '', value: '' }]);
              }}
            >
              + Add custom field
            </button>
          </Section>

          <Field label="Notes">
            <textarea className="input min-h-[80px]" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>

          {footerSlot && (
            <div className="pt-4 border-t border-brand-800">{footerSlot}</div>
          )}

          <div className="flex gap-3">
            <button type="submit" className="btn-primary" disabled={busy}>
              {busy ? 'Saving...' : mode === 'create' ? 'Create item' : 'Save changes'}
            </button>
            <button type="button" className="btn-ghost" onClick={() => router.back()}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    </form>
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

function Section({
  title,
  children,
  defaultOpen = false,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details className="card p-4 group" open={defaultOpen}>
      <summary className="cursor-pointer list-none flex items-center justify-between text-sm font-medium select-none">
        <span>{title}</span>
        <span className="text-brand-400 text-xs group-open:rotate-180 transition-transform">▼</span>
      </summary>
      <div className="pt-3 space-y-3">{children}</div>
    </details>
  );
}

function categoryLabel(slug: CategorySlug) {
  return CATEGORIES.find((c) => c.slug === slug)?.name ?? slug;
}
