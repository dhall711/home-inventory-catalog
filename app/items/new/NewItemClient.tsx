'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AIExtractedItem, CategorySlug } from '@/lib/types';
import { ItemForm } from '@/components/ItemForm';
import { QuickConfirm, type QuickDraft } from '@/components/QuickConfirm';

interface SelectOption { id: string; name: string }
interface Props {
  locations: SelectOption[];
  collections: SelectOption[];
  tags: SelectOption[];
  initialCategory?: CategorySlug;
  initialCollectionId?: string;
}

type Stage = 'photo' | 'quick' | 'details';

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
    setStage('photo');
    setError(null);
    // Reset any file-input value too by re-mounting via key swap below.
    setFileInputKey((k) => k + 1);
  }

  function goToItem(saved: { id: string }) {
    router.push(`/items/${saved.id}`);
    router.refresh();
  }

  // ---- Stage: photo capture ----
  const [fileInputKey, setFileInputKey] = useState(0);

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
            capture="environment"
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
          onSaveAndAddAnother={resetForAnother}
          onSaveAndDone={goToItem}
          onMoreDetails={(d) => {
            setQuickDraft(d);
            setStage('details');
          }}
        />
      </div>
    );
  }

  // ---- Stage: full details form ----
  // Merge AI prefill with whatever the user typed in the quick screen so
  // nothing is lost when switching to "more details".
  const mergedPrefill: AIExtractedItem | null = (() => {
    const base = (prefill ?? null) as AIExtractedItem | null;
    if (!base && !initialCategory && !quickDraft) return null;
    return {
      ...(base ?? ({} as AIExtractedItem)),
      name: quickDraft?.name || base?.name || '',
      category: (quickDraft?.category ?? base?.category ?? initialCategory ?? 'other') as CategorySlug,
      estimated_value: quickDraft?.current_value
        ? Number(quickDraft.current_value)
        : base?.estimated_value,
    } as AIExtractedItem;
  })();

  return (
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
    />
  );
}
