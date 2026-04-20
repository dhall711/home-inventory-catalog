'use client';

import { useMemo, useState } from 'react';
import { CATEGORIES, type AIExtractedItem, type AttachmentKind, type CategorySlug } from '@/lib/types';
import type { DocumentExtraction } from '@/lib/ai-document';
import { DocumentApplyDialog, type DocumentApplyResult, type ItemSnapshot } from './DocumentApplyDialog';

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

const KINDS: AttachmentKind[] = ['receipt', 'appraisal', 'manual', 'other'];
const KIND_LABEL: Record<AttachmentKind, string> = {
  receipt: 'Receipt',
  appraisal: 'Appraisal',
  manual: 'Manual / spec sheet',
  other: 'Other document',
};

interface PendingDoc {
  id: string;
  file: File;
  kind: AttachmentKind;
  status: 'extracting' | 'awaiting_confirm' | 'applied' | 'no_extraction' | 'error' | 'queued';
  appliedFieldCount?: number;
  errorMsg?: string;
  extraction?: DocumentExtraction;
  /** Snapshot of values the user accepted from this document. Tracked
   *  per-doc so the user can see which doc contributed what. */
  applied?: { fields: Record<string, unknown>; attributes: Record<string, unknown> };
}

interface PendingHistory {
  value: number;
  source: 'receipt' | 'appraisal';
  dated_on: string;
  notes: string | null;
}

interface PendingPhoto {
  id: string;
  name: string;
  status: 'uploading' | 'ready' | 'error';
  url?: string;
  thumb_url?: string;
  errorMsg?: string;
}

let docCounter = 0;
let photoCounter = 0;

/**
 * Mobile-first 4-field confirm screen used after AI prefill on a fresh photo.
 * Captures only what an insurance schedule actually needs: what is it, where is
 * it, and what's it worth. Anything else is one tap away via "Add more details".
 *
 * Also supports attaching documents (receipts, appraisals, manuals) BEFORE
 * saving. Each document is sent to the AI right away; the user confirms
 * which extracted fields to apply, and the file is queued for upload after
 * the item row is created.
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

  // ---- Document attachment state (pre-save) ----
  const [docKind, setDocKind] = useState<AttachmentKind>('receipt');
  const [pendingDocs, setPendingDocs] = useState<PendingDoc[]>([]);
  const [pendingHistory, setPendingHistory] = useState<PendingHistory[]>([]);
  // ---- Additional-photo state (pre-save) ----
  // Each extra photo is uploaded to /api/upload/photo right away so we
  // can show a thumbnail. After the item is created we link them via
  // POST /api/items/[id]/photos with the already-uploaded URLs.
  const [pendingPhotos, setPendingPhotos] = useState<PendingPhoto[]>([]);
  // Photo IDs currently being scanned by the AI (for spinner state).
  const [scanningPhotoId, setScanningPhotoId] = useState<string | null>(null);
  // Pending close-up scan extraction awaiting user confirmation.
  const [confirmScan, setConfirmScan] = useState<{
    photoId: string;
    extraction: DocumentExtraction;
  } | null>(null);
  // Fields that came from documents (or that the user filled via doc-confirm
  // dialog) and that aren't in the 4-field UI. Merged into the save payload.
  const [extraDraft, setExtraDraft] = useState<Record<string, unknown>>({});
  const [extraAttributes, setExtraAttributes] = useState<Record<string, unknown>>({});
  // Currently-open extraction dialog (if any).
  const [confirmDoc, setConfirmDoc] = useState<{ id: string; doc: PendingDoc } | null>(null);

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

  /**
   * The "current state" we hand to the dialog. It needs to reflect the
   * latest values (from photo prefill + form + previously-applied docs) so
   * the dialog's "was: X" labels and apply-by-default logic are accurate.
   */
  const currentSnapshot = useMemo<ItemSnapshot>(() => {
    const fromExtra = (key: string): unknown => extraDraft[key];
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
  }, [extraDraft, currentValue, prefill]);

  async function handleDocChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-picking the same file
    if (!file) return;
    const id = `doc-${++docCounter}`;
    const draft: PendingDoc = { id, file, kind: docKind, status: 'extracting' };
    setPendingDocs((arr) => [...arr, draft]);

    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('kind', docKind);
      fd.append(
        'context',
        JSON.stringify({
          name: name.trim() || prefill?.name || null,
          manufacturer: currentSnapshot.manufacturer,
          model: currentSnapshot.model,
          category,
        })
      );
      const res = await fetch('/api/extract-attachment', { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Extract failed');
      const extraction = json.extraction as DocumentExtraction;

      const hasAny = Boolean(
        extraction.manufacturer ||
          extraction.model ||
          extraction.serial_number ||
          extraction.notes ||
          extraction.vendor ||
          extraction.purchase_date ||
          extraction.total ||
          extraction.warranty_until ||
          extraction.appraiser ||
          extraction.appraisal_date ||
          extraction.appraised_value ||
          extraction.condition ||
          extraction.description ||
          extraction.artist ||
          extraction.medium ||
          extraction.dimensions ||
          extraction.year_created ||
          extraction.provenance
      );

      setPendingDocs((arr) =>
        arr.map((d) =>
          d.id === id
            ? {
                ...d,
                status: hasAny ? 'awaiting_confirm' : 'no_extraction',
                extraction,
              }
            : d
        )
      );
      if (hasAny) {
        setConfirmDoc({
          id,
          doc: { ...draft, status: 'awaiting_confirm', extraction },
        });
      }
    } catch (err) {
      setPendingDocs((arr) =>
        arr.map((d) =>
          d.id === id
            ? { ...d, status: 'error', errorMsg: err instanceof Error ? err.message : 'Failed' }
            : d
        )
      );
    }
  }

  function handleApply(docId: string, result: DocumentApplyResult) {
    // Pull out fields that are in the 4-field UI and reflect them in the
    // visible form so the user can see the change immediately.
    const f = { ...result.fields };
    if (typeof f.current_value === 'number') {
      setCurrentValue(String(f.current_value));
    }
    // Anything else gets merged into extraDraft / extraAttributes for the
    // save payload (manufacturer, model, serial, dates, etc.).
    setExtraDraft((prev) => ({ ...prev, ...f }));
    if (Object.keys(result.attributes).length > 0) {
      setExtraAttributes((prev) => ({ ...prev, ...result.attributes }));
    }
    if (result.valueHistoryEntry) {
      setPendingHistory((prev) => [...prev, result.valueHistoryEntry!]);
    }
    const appliedFieldCount =
      Object.keys(result.fields).length + Object.keys(result.attributes).length;
    setPendingDocs((arr) =>
      arr.map((d) =>
        d.id === docId
          ? {
              ...d,
              status: 'applied',
              appliedFieldCount,
              applied: { fields: result.fields, attributes: result.attributes },
            }
          : d
      )
    );
  }

  function handleSkipDoc(docId: string) {
    // User closed the dialog without applying anything. Keep the file
    // queued so it still gets attached to the item; just don't apply
    // any fields.
    setPendingDocs((arr) =>
      arr.map((d) => (d.id === docId ? { ...d, status: 'queued', appliedFieldCount: 0 } : d))
    );
  }

  function removePendingDoc(docId: string) {
    setPendingDocs((arr) => arr.filter((d) => d.id !== docId));
    // We don't rollback extraDraft from this doc; the user already saw &
    // accepted those values. They can edit them via "Add more details".
  }

  async function handlePhotosChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (files.length === 0) return;
    // Stage each file as "uploading", then upload in parallel and update
    // each row as it completes. Keeps the UI responsive when several
    // photos are picked at once.
    const staged: PendingPhoto[] = files.map((f) => ({
      id: `photo-${++photoCounter}`,
      name: f.name,
      status: 'uploading' as const,
    }));
    setPendingPhotos((arr) => [...arr, ...staged]);

    await Promise.all(
      files.map(async (file, i) => {
        const id = staged[i].id;
        try {
          const fd = new FormData();
          fd.append('file', file);
          const res = await fetch('/api/upload/photo', { method: 'POST', body: fd });
          const json = await res.json();
          if (!res.ok) throw new Error(json.error ?? 'Upload failed');
          setPendingPhotos((arr) =>
            arr.map((p) =>
              p.id === id
                ? { ...p, status: 'ready', url: json.url as string, thumb_url: json.thumb_url as string }
                : p
            )
          );
        } catch (err) {
          setPendingPhotos((arr) =>
            arr.map((p) =>
              p.id === id
                ? { ...p, status: 'error', errorMsg: err instanceof Error ? err.message : 'Failed' }
                : p
            )
          );
        }
      })
    );
  }

  function removePendingPhoto(id: string) {
    // Best-effort remove; the underlying blob in storage is intentionally
    // left to GC (we don't have a delete-by-path endpoint and orphans
    // here behave the same as if the user abandoned the page mid-upload).
    setPendingPhotos((arr) => arr.filter((p) => p.id !== id));
  }

  async function handleScanPhoto(photo: PendingPhoto) {
    if (!photo.url) return;
    setError(null);
    setScanningPhotoId(photo.id);
    try {
      const res = await fetch('/api/scan-photo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          photo_url: photo.url,
          context: {
            name: name.trim() || prefill?.name || null,
            manufacturer: currentSnapshot.manufacturer,
            model: currentSnapshot.model,
            category,
          },
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Scan failed');
      const extraction = json.extraction as DocumentExtraction;
      const hasAny = Boolean(
        extraction.manufacturer ||
          extraction.model ||
          extraction.serial_number ||
          extraction.warranty_until ||
          extraction.notes
      );
      if (!hasAny) {
        setError("AI couldn't read anything useful from this close-up.");
        return;
      }
      setConfirmScan({ photoId: photo.id, extraction });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Scan failed');
    } finally {
      setScanningPhotoId(null);
    }
  }

  function applyScan(result: DocumentApplyResult) {
    // Same merge logic as document apply, minus value-history (close-up
    // scans never produce a price).
    const f = { ...result.fields };
    if (typeof f.current_value === 'number') {
      setCurrentValue(String(f.current_value));
    }
    setExtraDraft((prev) => ({ ...prev, ...f }));
    if (Object.keys(result.attributes).length > 0) {
      setExtraAttributes((prev) => ({ ...prev, ...result.attributes }));
    }
  }

  async function save(then: 'add_another' | 'done') {
    setError(null);
    if (!name.trim()) {
      setError('Name is required.');
      return;
    }
    // Don't let the user save mid-extraction or with an open dialog.
    if (pendingDocs.some((d) => d.status === 'extracting')) {
      setError('Still reading documents — please wait a moment.');
      return;
    }
    if (pendingPhotos.some((p) => p.status === 'uploading')) {
      setError('Still uploading photos — please wait a moment.');
      return;
    }
    if (confirmDoc) {
      setError('Confirm or close the document dialog before saving.');
      return;
    }
    setBusy(true);
    try {
      const valueNum = currentValue ? Number(currentValue) : null;

      // Decide the value source: appraisal/receipt from a doc trumps a
      // manual estimate or AI-from-photo guess.
      const docOriginatedValue = pendingDocs.some(
        (d) => d.status === 'applied' && d.applied?.fields.current_value != null
      );
      const valueSource = !valueNum
        ? null
        : docOriginatedValue && extraDraft.current_value_source
        ? (extraDraft.current_value_source as string)
        : prefill?.estimated_value
        ? 'ai'
        : 'manual';

      const payload = {
        name: name.trim(),
        category,
        current_value: valueNum,
        current_value_source: valueSource,
        current_value_updated_at: valueNum
          ? (extraDraft.current_value_updated_at as string | undefined) ?? new Date().toISOString()
          : null,
        location_id: locationId || null,
        collection_id: initialCollectionId || null,
        primary_photo_url: photoUrl || null,
        primary_photo_thumb_url: photoThumbUrl || null,
        // Photo prefill (lowest priority — overridden by doc applies below)
        description: txt(prefill?.description),
        manufacturer: txt(prefill?.manufacturer),
        model: txt(prefill?.model),
        serial_number: txt(prefill?.serial_number),
        condition: txt(prefill?.condition),
        acquired_date: date(prefill?.acquired_date),
        acquired_price: num(prefill?.acquired_price),
        ai_raw_json: prefill ?? null,
        ai_confidence: prefill?.confidence ?? null,
        attributes: { ...(prefill?.attributes ?? {}), ...extraAttributes },
        ...(valueNum ? { initial_value: valueNum } : {}),
        // Doc-applied overrides go last so they win.
        ...extraDraft,
      };

      const res = await fetch('/api/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Save failed');
      const saved = json.item as { id: string };

      // Now upload every queued document and log every queued value-history
      // entry. We keep going if any individual upload fails so the item is
      // never orphaned by a stray attachment error.
      const uploadable = pendingDocs.filter((d) => d.status === 'applied' || d.status === 'queued' || d.status === 'no_extraction');
      await Promise.allSettled(
        uploadable.map(async (d) => {
          const fd = new FormData();
          fd.append('file', d.file);
          fd.append('item_id', saved.id);
          fd.append('kind', d.kind);
          await fetch('/api/upload/attachment', { method: 'POST', body: fd });
        })
      );
      await Promise.allSettled(
        pendingHistory.map((h) =>
          fetch('/api/value-history', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ item_id: saved.id, ...h }),
          })
        )
      );
      // Link any pre-uploaded extra photos to the new item. We pass the
      // already-uploaded URLs so the server doesn't have to re-process
      // the bytes a second time.
      await Promise.allSettled(
        pendingPhotos
          .filter((p) => p.status === 'ready' && p.url)
          .map((p) =>
            fetch(`/api/items/${saved.id}/photos`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ url: p.url, thumb_url: p.thumb_url ?? null }),
            })
          )
      );

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
                {prefill?.estimated_value != null && !pendingDocs.some((d) => d.status === 'applied') && (
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

      {/* ---------------------------------------------------------------- */}
      {/* More photos (optional) - close-ups of serial tags, accessories,  */}
      {/* damage, etc. Each is uploaded immediately so the user sees a     */}
      {/* thumbnail; they're linked to the item right after Save.          */}
      {/* ---------------------------------------------------------------- */}
      <div className="space-y-2 pt-3 border-t border-brand-800">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <div className="text-sm font-medium">Add more photos <span className="text-xs font-normal text-brand-400">(optional)</span></div>
            <div className="text-[11px] text-brand-400">
              Close-ups of serial-number tags, hallmarks, signatures, damage, accessories.
            </div>
          </div>
          <label className="btn-secondary text-xs cursor-pointer whitespace-nowrap">
            Add photos
            <input
              type="file"
              className="hidden"
              accept="image/*"
              multiple
              onChange={handlePhotosChosen}
              disabled={busy}
            />
          </label>
        </div>
        {pendingPhotos.length > 0 && (
          <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
            {pendingPhotos.map((p) => {
              const isScanning = scanningPhotoId === p.id;
              return (
                <div
                  key={p.id}
                  className="relative aspect-square rounded bg-brand-950 border border-brand-800 overflow-hidden group"
                  title={p.name}
                >
                  {p.status === 'ready' && p.thumb_url ? (
                    <img src={p.thumb_url} alt={p.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-[10px] text-brand-300 text-center px-1">
                      {p.status === 'uploading' && 'Uploading…'}
                      {p.status === 'error' && (
                        <span className="text-red-300">Error</span>
                      )}
                    </div>
                  )}
                  {/* Hover overlay with Scan button. Mirrors the gallery
                      panel on the detail page so the workflow is the same. */}
                  {p.status === 'ready' && (
                    <div
                      className={`absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-1 transition ${
                        isScanning ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                      }`}
                    >
                      <button
                        type="button"
                        className="w-full text-[10px] text-accent hover:text-white disabled:opacity-50"
                        onClick={() => handleScanPhoto(p)}
                        disabled={isScanning || busy}
                        title="Scan this close-up for serial / model / manufacturer"
                      >
                        {isScanning ? 'Reading…' : 'Scan'}
                      </button>
                    </div>
                  )}
                  <button
                    type="button"
                    className="absolute top-1 right-1 bg-black/60 hover:bg-red-700 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
                    onClick={() => removePendingPhoto(p.id)}
                    title="Remove"
                    aria-label="Remove photo"
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>
        )}
        {pendingPhotos.some((p) => p.status === 'ready') && (
          <p className="text-[11px] text-brand-400">
            Hover a thumbnail and click <span className="text-accent">Scan</span> to pull the serial number, model or manufacturer off a close-up.
          </p>
        )}
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* Documents (optional) - attach a receipt/appraisal/manual now and */}
      {/* let the AI fill in serial, price, vendor, value, etc.             */}
      {/* ---------------------------------------------------------------- */}
      <div className="space-y-2 pt-3 border-t border-brand-800">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <div className="text-sm font-medium">Attach a document <span className="text-xs font-normal text-brand-400">(optional)</span></div>
            <div className="text-[11px] text-brand-400">
              Receipts, appraisals or manuals — AI will pull out vendor, price, value, serial, etc.
            </div>
          </div>
          <div className="flex items-center gap-2">
            <select
              className="input w-40 text-xs"
              value={docKind}
              onChange={(e) => setDocKind(e.target.value as AttachmentKind)}
              disabled={busy}
            >
              {KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
            </select>
            <label className="btn-secondary text-xs cursor-pointer whitespace-nowrap">
              Add file
              <input
                type="file"
                className="hidden"
                accept="image/*,application/pdf"
                onChange={handleDocChosen}
                disabled={busy}
              />
            </label>
          </div>
        </div>
        {pendingDocs.length > 0 && (
          <ul className="space-y-1">
            {pendingDocs.map((d) => (
              <li
                key={d.id}
                className="flex items-center justify-between gap-2 text-xs bg-brand-900/40 border border-brand-800 rounded px-2 py-1.5"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-brand-100">
                    <span className="text-brand-400 mr-2">{KIND_LABEL[d.kind]}:</span>
                    {d.file.name}
                  </div>
                  <div className="text-brand-400">
                    {d.status === 'extracting' && 'Reading with AI…'}
                    {d.status === 'awaiting_confirm' && 'Ready — confirm to apply fields'}
                    {d.status === 'applied' && (
                      <>✓ Applied {d.appliedFieldCount ?? 0} field{d.appliedFieldCount === 1 ? '' : 's'} • will attach on save</>
                    )}
                    {d.status === 'queued' && 'Queued — will attach on save (no fields applied)'}
                    {d.status === 'no_extraction' && 'No extractable details — will still attach on save'}
                    {d.status === 'error' && <span className="text-red-300">Error: {d.errorMsg}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {d.status === 'awaiting_confirm' && d.extraction && (
                    <button
                      type="button"
                      className="text-accent hover:opacity-80"
                      onClick={() => setConfirmDoc({ id: d.id, doc: d })}
                    >
                      Review
                    </button>
                  )}
                  <button
                    type="button"
                    className="text-red-300 hover:text-red-200"
                    onClick={() => removePendingDoc(d.id)}
                    disabled={d.status === 'extracting'}
                    title="Remove"
                  >
                    ✕
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
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

      {confirmDoc && confirmDoc.doc.extraction && (
        <DocumentApplyDialog
          mode="callback"
          kind={confirmDoc.doc.kind}
          category={category}
          current={currentSnapshot}
          extraction={confirmDoc.doc.extraction}
          onClose={() => {
            // Closing without applying = "Skip" the field-merge step but
            // keep the file queued for upload after save.
            handleSkipDoc(confirmDoc.id);
            setConfirmDoc(null);
          }}
          onApply={(result) => {
            handleApply(confirmDoc.id, result);
            setConfirmDoc(null);
          }}
        />
      )}

      {confirmScan && (
        <DocumentApplyDialog
          mode="callback"
          kind="manual"
          category={category}
          current={currentSnapshot}
          extraction={confirmScan.extraction}
          onClose={() => setConfirmScan(null)}
          onApply={(result) => {
            applyScan(result);
            setConfirmScan(null);
          }}
        />
      )}
    </div>
  );
}
