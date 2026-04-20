'use client';

import { useState } from 'react';
import type { ItemPhoto } from '@/lib/types';
import type { ReceiptExtraction } from '@/lib/ai-receipt';
import { ItemPhotosPanel } from './ItemPhotosPanel';
import { ReceiptApplyDialog, type ItemSnapshot } from './ReceiptApplyDialog';

interface Props {
  itemId: string;
  itemName: string;
  initialPhotos: ItemPhoto[];
  fallbackPrimary: { url: string | null; thumb_url: string | null };
  itemSnapshot: ItemSnapshot;
  category: string | null;
}

/**
 * Thin wrapper that pairs the multi-photo gallery with the AI close-up
 * scanner. When the user clicks "Scan" on a thumbnail (typically a
 * close-up of a serial-number tag or spec plate), we hit /api/scan-photo
 * and surface the result through the same per-field confirmation dialog
 * the receipt extraction uses.
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
  const [pending, setPending] = useState<{ extraction: ReceiptExtraction } | null>(null);

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
      const extraction = json.extraction as ReceiptExtraction;
      // If the model returned absolutely nothing applicable, surface a
      // friendly message rather than opening an empty dialog.
      const hasAnything =
        extraction.manufacturer ||
        extraction.model ||
        extraction.serial_number ||
        extraction.warranty_until ||
        extraction.notes;
      if (!hasAnything) {
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
        <ReceiptApplyDialog
          itemId={itemId}
          category={category}
          current={itemSnapshot}
          extraction={pending.extraction}
          onClose={() => setPending(null)}
        />
      )}
    </>
  );
}
