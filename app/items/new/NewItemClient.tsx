'use client';

import { useState } from 'react';
import type { AIExtractedItem, CategorySlug } from '@/lib/types';
import { ItemForm } from '@/components/ItemForm';

interface SelectOption { id: string; name: string }
interface Props {
  locations: SelectOption[];
  collections: SelectOption[];
  tags: SelectOption[];
  initialCategory?: CategorySlug;
  initialCollectionId?: string;
}

export function NewItemClient({ locations, collections, tags, initialCategory, initialCollectionId }: Props) {
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoThumb, setPhotoThumb] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [prefill, setPrefill] = useState<AIExtractedItem | null>(null);
  const [skipped, setSkipped] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        // Allow user to continue manually even if AI fails
        console.warn('AI analyze error', ai);
        setPrefill(null);
      } else {
        setPrefill(ai.data as AIExtractedItem);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setAnalyzing(false);
    }
  }

  if (photoUrl || skipped) {
    // Merge an AI prefill with any category/collection seeded from the
    // URL (e.g. when creating an item from inside a collection).
    const mergedPrefill: AIExtractedItem | null = (() => {
      if (!prefill && !initialCategory) return null;
      return {
        ...(prefill ?? ({} as AIExtractedItem)),
        category: (prefill?.category ?? initialCategory ?? 'other') as CategorySlug,
      };
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
      />
    );
  }

  return (
    <div className="card p-8 max-w-xl">
      <p className="text-brand-200 mb-4">
        Take or upload a photo and the AI will pre-fill what it can identify. You can always edit before saving.
      </p>
      <input
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFile}
        disabled={analyzing}
        className="block mb-4"
      />
      {analyzing && <div className="text-sm text-brand-300 mb-4">Uploading and analyzing...</div>}
      {error && <div className="text-sm text-red-300 mb-4">{error}</div>}
      <button type="button" className="btn-ghost" onClick={() => setSkipped(true)}>
        Skip and enter manually
      </button>
    </div>
  );
}
