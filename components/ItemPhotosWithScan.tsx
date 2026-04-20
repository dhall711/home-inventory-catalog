'use client';

import { useState } from 'react';
import type { CategorySlug, ItemPhoto } from '@/lib/types';
import type { DocumentExtraction } from '@/lib/ai-document';
import { hasAnyExtraction } from '@/lib/ai-document';
import { ItemPhotosPanel } from './ItemPhotosPanel';
import { DocumentApplyDialog, type ItemSnapshot } from './DocumentApplyDialog';

interface Props {
  itemId: string;
  itemName: string;
  initialPhotos: ItemPhoto[];
  fallbackPrimary: { url: string | null; thumb_url: string | null };
  itemSnapshot: ItemSnapshot;
  category: CategorySlug | string | null;
}

/**
 * Thin wrapper that pairs the multi-photo gallery with the AI close-up
 * scanner. When the user clicks "Scan" on a thumbnail (typically a
 * close-up of a serial-number tag or spec plate), we hit /api/scan-photo
 * and surface the result through the same per-field confirmation dialog
 * the document extraction uses. We treat close-ups as "manual"-kind so
 * the dialog doesn't pull in receipt or appraisal price defaults.
 */
export function ItemPhotosWithScan({
  itemId,
  itemName,
  initialPhotos,
  fallbackPrimary,
  itemSnapshot,
  category,
}: Props) {
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<{ extraction: DocumentExtraction } | null>(null);

  async function handleScan(photo: ItemPhoto) {
    setError(null);
    setScanning(true);
    try {
      const res = await fetch('/api/scan-photo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photo_id: photo.id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Scan failed');
      const extraction = json.extraction as DocumentExtraction;
      if (!hasAnyExtraction(extraction)) {
        setError("AI couldn't read anything useful from this close-up.");
        return;
      }
      setPending({ extraction });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Scan failed');
    } finally {
      setScanning(false);
    }
  }

  return (
    <>
      <ItemPhotosPanel
        itemId={itemId}
        itemName={itemName}
        initial={initialPhotos}
        fallbackPrimary={fallbackPrimary}
        onScanPhoto={handleScan}
      />
      {scanning && <div className="text-xs text-brand-300">Reading close-up with AI…</div>}
      {error && <div className="text-xs text-red-300">{error}</div>}
      {pending && (
        <DocumentApplyDialog
          itemId={itemId}
          kind="manual"
          category={category}
          current={itemSnapshot}
          extraction={pending.extraction}
          onClose={() => setPending(null)}
        />
      )}
    </>
  );
}
