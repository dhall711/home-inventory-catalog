'use client';

import { useState } from 'react';
import type { AttachmentKind, CategorySlug } from '@/lib/types';
import type { DocumentExtraction } from '@/lib/ai-document';
import {
  type PendingDoc,
  type PendingPhoto,
  type PendingHistory,
  type ItemExtrasState,
  nextDocId,
  nextPhotoId,
} from '@/lib/item-extras';
import { DocumentApplyDialog, type DocumentApplyResult, type ItemSnapshot } from './DocumentApplyDialog';

const KINDS: AttachmentKind[] = ['receipt', 'appraisal', 'manual', 'other'];
const KIND_LABEL: Record<AttachmentKind, string> = {
  receipt: 'Receipt',
  appraisal: 'Appraisal',
  manual: 'Manual / spec sheet',
  other: 'Other document',
};

interface Props {
  extras: ItemExtrasState;
  setExtras: React.Dispatch<React.SetStateAction<ItemExtrasState>>;
  /** Snapshot the AI uses for "was: X" hints + apply-by-default heuristics. */
  currentSnapshot: ItemSnapshot;
  /** Item context the AI uses while extracting/scanning. */
  context: {
    name: string | null;
    category: CategorySlug;
  };
  /** Called when an extraction sets a current_value so the visible form input updates. */
  onCurrentValueApplied?: (value: number) => void;
  /** Disable inputs while a parent save is in flight. */
  busy?: boolean;
}

/**
 * Controlled UI for queuing additional photos and documents on a not-yet-saved
 * item. Lives outside the form components so the same state survives toggling
 * between the Quick-confirm and the full Details views.
 */
export function ItemExtrasPanel({
  extras,
  setExtras,
  currentSnapshot,
  context,
  onCurrentValueApplied,
  busy = false,
}: Props) {
  const [docKind, setDocKind] = useState<AttachmentKind>('receipt');
  const [error, setError] = useState<string | null>(null);
  const [scanningPhotoId, setScanningPhotoId] = useState<string | null>(null);
  const [confirmDoc, setConfirmDoc] = useState<{ id: string; doc: PendingDoc } | null>(null);
  const [confirmScan, setConfirmScan] = useState<{
    photoId: string;
    extraction: DocumentExtraction;
  } | null>(null);

  // ---- Documents ----
  async function handleDocChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const id = nextDocId();
    const draft: PendingDoc = { id, file, kind: docKind, status: 'extracting' };
    setExtras((prev) => ({ ...prev, pendingDocs: [...prev.pendingDocs, draft] }));

    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('kind', docKind);
      fd.append(
        'context',
        JSON.stringify({
          name: context.name,
          manufacturer: currentSnapshot.manufacturer,
          model: currentSnapshot.model,
          category: context.category,
        })
      );
      const res = await fetch('/api/extract-attachment', { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Extract failed');
      const extraction = json.extraction as DocumentExtraction;

      const hasAny = hasExtractedAny(extraction);
      setExtras((prev) => ({
        ...prev,
        pendingDocs: prev.pendingDocs.map((d) =>
          d.id === id
            ? { ...d, status: hasAny ? 'awaiting_confirm' : 'no_extraction', extraction }
            : d
        ),
      }));
      if (hasAny) {
        setConfirmDoc({ id, doc: { ...draft, status: 'awaiting_confirm', extraction } });
      }
    } catch (err) {
      setExtras((prev) => ({
        ...prev,
        pendingDocs: prev.pendingDocs.map((d) =>
          d.id === id
            ? { ...d, status: 'error', errorMsg: err instanceof Error ? err.message : 'Failed' }
            : d
        ),
      }));
    }
  }

  function applyDocResult(docId: string, result: DocumentApplyResult) {
    const f = { ...result.fields };
    if (typeof f.current_value === 'number' && onCurrentValueApplied) {
      onCurrentValueApplied(f.current_value);
    }
    const appliedFieldCount =
      Object.keys(result.fields).length + Object.keys(result.attributes).length;
    setExtras((prev) => ({
      ...prev,
      extraDraft: { ...prev.extraDraft, ...f },
      extraAttributes:
        Object.keys(result.attributes).length > 0
          ? { ...prev.extraAttributes, ...result.attributes }
          : prev.extraAttributes,
      pendingHistory: result.valueHistoryEntry
        ? [...prev.pendingHistory, result.valueHistoryEntry]
        : prev.pendingHistory,
      pendingDocs: prev.pendingDocs.map((d) =>
        d.id === docId
          ? {
              ...d,
              status: 'applied',
              appliedFieldCount,
              applied: { fields: result.fields, attributes: result.attributes },
            }
          : d
      ),
    }));
  }

  function skipDoc(docId: string) {
    setExtras((prev) => ({
      ...prev,
      pendingDocs: prev.pendingDocs.map((d) =>
        d.id === docId ? { ...d, status: 'queued', appliedFieldCount: 0 } : d
      ),
    }));
  }

  function removeDoc(docId: string) {
    setExtras((prev) => ({
      ...prev,
      pendingDocs: prev.pendingDocs.filter((d) => d.id !== docId),
    }));
  }

  // ---- Photos ----
  async function handlePhotosChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (files.length === 0) return;
    const staged: PendingPhoto[] = files.map((f) => ({
      id: nextPhotoId(),
      name: f.name,
      status: 'uploading' as const,
    }));
    setExtras((prev) => ({ ...prev, pendingPhotos: [...prev.pendingPhotos, ...staged] }));

    await Promise.all(
      files.map(async (file, i) => {
        const id = staged[i].id;
        try {
          const fd = new FormData();
          fd.append('file', file);
          const res = await fetch('/api/upload/photo', { method: 'POST', body: fd });
          const json = await res.json();
          if (!res.ok) throw new Error(json.error ?? 'Upload failed');
          setExtras((prev) => ({
            ...prev,
            pendingPhotos: prev.pendingPhotos.map((p) =>
              p.id === id
                ? { ...p, status: 'ready', url: json.url as string, thumb_url: json.thumb_url as string }
                : p
            ),
          }));
        } catch (err) {
          setExtras((prev) => ({
            ...prev,
            pendingPhotos: prev.pendingPhotos.map((p) =>
              p.id === id
                ? { ...p, status: 'error', errorMsg: err instanceof Error ? err.message : 'Failed' }
                : p
            ),
          }));
        }
      })
    );
  }

  function removePhoto(id: string) {
    setExtras((prev) => ({ ...prev, pendingPhotos: prev.pendingPhotos.filter((p) => p.id !== id) }));
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
            name: context.name,
            manufacturer: currentSnapshot.manufacturer,
            model: currentSnapshot.model,
            category: context.category,
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
    const f = { ...result.fields };
    if (typeof f.current_value === 'number' && onCurrentValueApplied) {
      onCurrentValueApplied(f.current_value);
    }
    setExtras((prev) => ({
      ...prev,
      extraDraft: { ...prev.extraDraft, ...f },
      extraAttributes:
        Object.keys(result.attributes).length > 0
          ? { ...prev.extraAttributes, ...result.attributes }
          : prev.extraAttributes,
    }));
  }

  return (
    <div className="space-y-5">
      {error && (
        <div className="bg-red-900/30 border border-red-800/50 rounded-md p-3 text-sm text-red-200">{error}</div>
      )}

      {/* ---------------- More photos ---------------- */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <div className="text-sm font-medium">
              Add more photos <span className="text-xs font-normal text-brand-400">(optional)</span>
            </div>
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
        {extras.pendingPhotos.length > 0 && (
          <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
            {extras.pendingPhotos.map((p) => {
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
                      {p.status === 'error' && <span className="text-red-300">Error</span>}
                    </div>
                  )}
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
                    onClick={() => removePhoto(p.id)}
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
        {extras.pendingPhotos.some((p) => p.status === 'ready') && (
          <p className="text-[11px] text-brand-400">
            Hover a thumbnail and click <span className="text-accent">Scan</span> to pull the serial number, model or manufacturer off a close-up.
          </p>
        )}
      </div>

      {/* ---------------- Documents ---------------- */}
      <div className="space-y-2 pt-3 border-t border-brand-800">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <div className="text-sm font-medium">
              Attach a document <span className="text-xs font-normal text-brand-400">(optional)</span>
            </div>
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
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {KIND_LABEL[k]}
                </option>
              ))}
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
        {extras.pendingDocs.length > 0 && (
          <ul className="space-y-1">
            {extras.pendingDocs.map((d) => (
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
                      <>
                        ✓ Applied {d.appliedFieldCount ?? 0} field{d.appliedFieldCount === 1 ? '' : 's'} • will attach on save
                      </>
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
                    onClick={() => removeDoc(d.id)}
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

      {confirmDoc && confirmDoc.doc.extraction && (
        <DocumentApplyDialog
          mode="callback"
          kind={confirmDoc.doc.kind}
          category={context.category}
          current={currentSnapshot}
          extraction={confirmDoc.doc.extraction}
          onClose={() => {
            skipDoc(confirmDoc.id);
            setConfirmDoc(null);
          }}
          onApply={(result) => {
            applyDocResult(confirmDoc.id, result);
            setConfirmDoc(null);
          }}
        />
      )}

      {confirmScan && (
        <DocumentApplyDialog
          mode="callback"
          kind="manual"
          category={context.category}
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

function hasExtractedAny(e: DocumentExtraction): boolean {
  return Boolean(
    e.manufacturer ||
      e.model ||
      e.serial_number ||
      e.notes ||
      e.vendor ||
      e.purchase_date ||
      e.total ||
      e.warranty_until ||
      e.appraiser ||
      e.appraisal_date ||
      e.appraised_value ||
      e.condition ||
      e.description ||
      e.artist ||
      e.medium ||
      e.dimensions ||
      e.year_created ||
      e.provenance
  );
}
