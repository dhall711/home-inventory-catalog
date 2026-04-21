'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AIExtractedItem, CategorySlug } from '@/lib/types';
import { ItemForm } from '@/components/ItemForm';
import { QuickConfirm, type QuickDraft } from '@/components/QuickConfirm';
import { ItemExtrasPanel } from '@/components/ItemExtrasPanel';
import { EMPTY_EXTRAS, type ItemExtrasState } from '@/lib/item-extras';
import type { ItemSnapshot } from '@/components/DocumentApplyDialog';

interface SelectOption { id: string; name: string }
interface Props {
  locations: SelectOption[];
  collections: SelectOption[];
  tags: SelectOption[];
  initialCategory?: CategorySlug;
  initialCollectionId?: string;
}

type Stage = 'photo' | 'quick' | 'details';

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

export function NewItemClient({ locations, collections, tags, initialCategory, initialCollectionId }: Props) {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>('photo');
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoThumb, setPhotoThumb] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [prefill, setPrefill] = useState<AIExtractedItem | null>(null);
  const [quickDraft, setQuickDraft] = useState<QuickDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedCount, setSavedCount] = useState(0);
  const [lastSavedId, setLastSavedId] = useState<string | null>(null);
  // ---- Extras state, lifted here so toggling between Quick / Details
  //      doesn't lose queued photos, documents, AI applies, or value history.
  const [extras, setExtras] = useState<ItemExtrasState>(EMPTY_EXTRAS);
  const [fileInputKey, setFileInputKey] = useState(0);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setAnalyzing(true);
    try {
      const fd = new FormData();
      fd.append('file', file);

      const upRes = await fetch('/api/upload/photo', { method: 'POST', body: fd });
      const up = await upRes.json();
      if (!upRes.ok) throw new Error(up.error ?? 'Upload failed');
      setPhotoUrl(up.url);
      setPhotoThumb(up.thumb_url);

      const aiRes = await fetch('/api/analyze-item', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_url: up.url }),
      });
      const ai = await aiRes.json();
      if (!aiRes.ok) {
        console.warn('AI analyze error', ai);
        setPrefill(null);
      } else {
        setPrefill(ai.data as AIExtractedItem);
      }
      setStage('quick');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setAnalyzing(false);
    }
  }

  function resetForAnother(saved: { id: string }) {
    setSavedCount((c) => c + 1);
    setLastSavedId(saved.id);
    setPhotoUrl(null);
    setPhotoThumb(null);
    setPrefill(null);
    setQuickDraft(null);
    setExtras(EMPTY_EXTRAS);
    setStage('photo');
    setError(null);
    setFileInputKey((k) => k + 1);
  }

  function goToItem(saved: { id: string }) {
    router.push(`/items/${saved.id}`);
    router.refresh();
  }

  /**
   * Shared save path used by both QuickConfirm and the full Details form.
   * Merges the form's payload with the lifted extras (extraDraft,
   * extraAttributes), POSTs /api/items, then attaches all queued documents,
   * links pre-uploaded extra photos, and logs queued value-history entries.
   */
  async function saveAndLinkExtras(basePayload: Record<string, unknown>): Promise<{ id: string }> {
    // Doc-applied overrides win over the visible form (they come from a more
    // authoritative source — the actual receipt / appraisal / scan). The
    // user already saw and confirmed them in DocumentApplyDialog.
    const mergedAttributes = {
      ...((basePayload.attributes as Record<string, unknown>) ?? {}),
      ...extras.extraAttributes,
    };
    const payload = {
      ...basePayload,
      attributes: mergedAttributes,
      ...extras.extraDraft,
    };

    const res = await fetch('/api/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? 'Save failed');
    const saved = json.item as { id: string };

    // Best-effort linkage of all queued extras. We swallow per-row errors so
    // the item is never orphaned by a single failed attachment.
    const uploadable = extras.pendingDocs.filter(
      (d) => d.status === 'applied' || d.status === 'queued' || d.status === 'no_extraction'
    );
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
      extras.pendingHistory.map((h) =>
        fetch('/api/value-history', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ item_id: saved.id, ...h }),
        })
      )
    );
    await Promise.allSettled(
      extras.pendingPhotos
        .filter((p) => p.status === 'ready' && p.url)
        .map((p) =>
          fetch(`/api/items/${saved.id}/photos`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: p.url, thumb_url: p.thumb_url ?? null }),
          })
        )
    );

    return saved;
  }

  /** QuickConfirm submit: condenses the 4 visible fields into the items POST. */
  async function handleQuickSubmit(
    core: { name: string; category: CategorySlug; current_value: string; location_id: string },
    then: 'add_another' | 'done'
  ) {
    const valueNum = core.current_value ? Number(core.current_value) : null;
    const docOriginatedValue = extras.pendingDocs.some(
      (d) => d.status === 'applied' && d.applied?.fields.current_value != null
    );
    const valueSource = !valueNum
      ? null
      : docOriginatedValue && extras.extraDraft.current_value_source
      ? (extras.extraDraft.current_value_source as string)
      : prefill?.estimated_value
      ? 'ai'
      : 'manual';

    const basePayload = {
      name: core.name,
      category: core.category,
      current_value: valueNum,
      current_value_source: valueSource,
      current_value_updated_at: valueNum
        ? (extras.extraDraft.current_value_updated_at as string | undefined) ?? new Date().toISOString()
        : null,
      location_id: core.location_id || null,
      collection_id: initialCollectionId || null,
      primary_photo_url: photoUrl || null,
      primary_photo_thumb_url: photoThumb || null,
      // Photo prefill (lowest priority — overridden by extraDraft)
      description: txt(prefill?.description),
      manufacturer: txt(prefill?.manufacturer),
      model: txt(prefill?.model),
      serial_number: txt(prefill?.serial_number),
      condition: txt(prefill?.condition),
      acquired_date: date(prefill?.acquired_date),
      acquired_price: num(prefill?.acquired_price),
      ai_raw_json: prefill ?? null,
      ai_confidence: prefill?.confidence ?? null,
      attributes: { ...(prefill?.attributes ?? {}) },
      ...(valueNum ? { initial_value: valueNum } : {}),
    };

    const saved = await saveAndLinkExtras(basePayload);
    if (then === 'add_another') resetForAnother(saved);
    else goToItem(saved);
  }

  /** ItemForm submit (in create mode): payload already contains everything
   *  the user typed in the full form; just merge in extras + link. */
  async function handleDetailsSubmit(payload: Record<string, unknown>) {
    const saved = await saveAndLinkExtras({
      ...payload,
      // Make sure the captured photo is preserved even if ItemForm's local
      // state somehow lost it.
      primary_photo_url: payload.primary_photo_url ?? photoUrl ?? null,
      primary_photo_thumb_url: payload.primary_photo_thumb_url ?? photoThumb ?? null,
    });
    goToItem(saved);
  }

  // Snapshot we hand to the extras panel's apply-dialogs in the details
  // stage. Reflects what's already been accepted from prior docs/scans.
  const detailsSnapshot = useMemo<ItemSnapshot>(() => {
    const fromExtra = (key: string): unknown => extras.extraDraft[key];
    return {
      acquired_date: (fromExtra('acquired_date') as string | null) ?? date(prefill?.acquired_date) ?? null,
      acquired_from: (fromExtra('acquired_from') as string | null) ?? null,
      acquired_price:
        (fromExtra('acquired_price') as number | null) ?? num(prefill?.acquired_price) ?? null,
      current_value:
        (fromExtra('current_value') as number | null) ??
        (quickDraft?.current_value ? num(quickDraft.current_value) : null) ??
        num(prefill?.estimated_value) ??
        null,
      manufacturer: (fromExtra('manufacturer') as string | null) ?? txt(prefill?.manufacturer) ?? null,
      model: (fromExtra('model') as string | null) ?? txt(prefill?.model) ?? null,
      serial_number: (fromExtra('serial_number') as string | null) ?? txt(prefill?.serial_number) ?? null,
      notes: (fromExtra('notes') as string | null) ?? null,
      description: (fromExtra('description') as string | null) ?? txt(prefill?.description) ?? null,
      condition: (fromExtra('condition') as string | null) ?? txt(prefill?.condition) ?? null,
    };
  }, [extras.extraDraft, prefill, quickDraft]);

  // ---- Stage: photo capture ----
  if (stage === 'photo') {
    return (
      <div className="space-y-4">
        {savedCount > 0 && (
          <div className="card p-3 text-sm flex items-center justify-between bg-emerald-900/20 border-emerald-800/40">
            <span>
              ✓ Added {savedCount} item{savedCount === 1 ? '' : 's'} so far.
              {lastSavedId && (
                <button
                  className="ml-2 underline text-emerald-200"
                  onClick={() => router.push(`/items/${lastSavedId}`)}
                >
                  View last
                </button>
              )}
            </span>
            <button className="btn-ghost text-xs" onClick={() => router.push('/items')}>Done</button>
          </div>
        )}
        <div className="card p-8 max-w-xl space-y-4">
          <div>
            <h2 className="text-lg font-semibold">Snap a photo</h2>
            <p className="text-sm text-brand-300 mt-1">
              The AI will identify the item and prefill its name, category, and an estimated value.
              You confirm in one screen and save.
            </p>
          </div>
          <input
            key={fileInputKey}
            type="file"
            accept="image/*"
            onChange={handleFile}
            disabled={analyzing}
            className="block"
          />
          {analyzing && <div className="text-sm text-brand-300">Uploading and analyzing...</div>}
          {error && <div className="text-sm text-red-300">{error}</div>}
          <div className="flex gap-2 pt-2 border-t border-brand-800">
            <button
              type="button"
              className="btn-ghost"
              onClick={() => {
                setPhotoUrl(null);
                setPhotoThumb(null);
                setPrefill(null);
                setStage('details');
              }}
            >
              Skip photo and enter manually
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ---- Stage: quick confirm (4 fields) ----
  if (stage === 'quick') {
    return (
      <div className="space-y-4">
        <div className="text-sm text-brand-300">
          AI prefilled what it could. Confirm the basics, or expand for the full form.
        </div>
        <QuickConfirm
          prefill={prefill}
          photoUrl={photoUrl}
          photoThumbUrl={photoThumb}
          locations={locations}
          initialCollectionId={initialCollectionId}
          extras={extras}
          setExtras={setExtras}
          onSubmit={handleQuickSubmit}
          onMoreDetails={(d) => {
            setQuickDraft(d);
            setStage('details');
          }}
        />
      </div>
    );
  }

  // ---- Stage: full details form ----
  // Carry everything forward: photo prefill, quick-screen edits, AND any
  // fields the user has already accepted from documents / close-up scans.
  const mergedPrefill: AIExtractedItem | null = (() => {
    const base = (prefill ?? null) as AIExtractedItem | null;
    if (!base && !initialCategory && !quickDraft && Object.keys(extras.extraDraft).length === 0) return null;
    const draftStr = (k: string): string | undefined => {
      const v = extras.extraDraft[k];
      return v == null || v === '' ? undefined : String(v);
    };
    const draftNum = (k: string): number | undefined => {
      const v = extras.extraDraft[k];
      if (v == null || v === '') return undefined;
      const n = Number(v);
      return Number.isFinite(n) ? n : undefined;
    };
    const mergedAttrs = {
      ...(base?.attributes ?? {}),
      ...extras.extraAttributes,
    } as Record<string, string | number | boolean | null | undefined>;
    return {
      ...(base ?? ({} as AIExtractedItem)),
      name: quickDraft?.name || base?.name || '',
      category: (quickDraft?.category ?? base?.category ?? initialCategory ?? 'other') as CategorySlug,
      description: draftStr('description') ?? base?.description,
      manufacturer: draftStr('manufacturer') ?? base?.manufacturer,
      model: draftStr('model') ?? base?.model,
      serial_number: draftStr('serial_number') ?? base?.serial_number,
      condition: draftStr('condition') ?? base?.condition,
      acquired_date: draftStr('acquired_date') ?? base?.acquired_date,
      acquired_price: draftNum('acquired_price') ?? base?.acquired_price,
      estimated_value:
        draftNum('current_value') ??
        (quickDraft?.current_value ? Number(quickDraft.current_value) : undefined) ??
        base?.estimated_value,
      attributes: mergedAttrs,
    } as AIExtractedItem;
  })();

  const queuedSummary = describeQueued(extras);

  return (
    <div className="space-y-4">
      {queuedSummary && (
        <div className="card p-3 text-xs bg-emerald-900/20 border-emerald-800/40 text-emerald-100">
          ✓ {queuedSummary} — will be attached when you save.
        </div>
      )}
      <ItemForm
        mode="create"
        prefill={mergedPrefill}
        initialPhotoUrl={photoUrl}
        initialPhotoThumbUrl={photoThumb}
        locations={locations}
        collections={collections}
        allTags={tags}
        initialCollectionId={initialCollectionId}
        initialLocationId={quickDraft?.location_id || undefined}
        onCreate={handleDetailsSubmit}
        footerSlot={
          <ItemExtrasPanel
            extras={extras}
            setExtras={setExtras}
            currentSnapshot={detailsSnapshot}
            context={{
              name: mergedPrefill?.name || quickDraft?.name || null,
              category: (mergedPrefill?.category ?? 'other') as CategorySlug,
            }}
          />
        }
      />
    </div>
  );
}

function describeQueued(extras: ItemExtrasState): string | null {
  const photos = extras.pendingPhotos.filter((p) => p.status === 'ready').length;
  const docs = extras.pendingDocs.filter(
    (d) => d.status === 'applied' || d.status === 'queued' || d.status === 'no_extraction'
  ).length;
  const applied = extras.pendingDocs.filter((d) => d.status === 'applied').length;
  const parts: string[] = [];
  if (photos > 0) parts.push(`${photos} photo${photos === 1 ? '' : 's'}`);
  if (docs > 0) parts.push(`${docs} document${docs === 1 ? '' : 's'}${applied > 0 ? ` (${applied} with applied AI fields)` : ''}`);
  if (parts.length === 0) return null;
  return parts.join(' + ');
}
