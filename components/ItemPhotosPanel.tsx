'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ItemPhoto } from '@/lib/types';

interface Props {
  itemId: string;
  itemName: string;
  initial: ItemPhoto[];
  // Fallback if there are no item_photos rows yet but the item still has a
  // primary_photo_url (legacy items created before multi-photo support).
  fallbackPrimary?: { url: string | null; thumb_url: string | null };
  onScanPhoto?: (photo: ItemPhoto) => void;
}

/**
 * Multi-photo gallery for an item.
 *
 * Renders the primary photo as the hero, a thumbnail strip below for the
 * full collection, and an "+ Add photo" affordance. Clicking a thumbnail
 * opens a lightbox. Each thumbnail has hover actions to set-as-primary
 * or remove (and optionally "Scan for serial #" if onScanPhoto is given).
 */
export function ItemPhotosPanel({
  itemId,
  itemName,
  initial,
  fallbackPrimary,
  onScanPhoto,
}: Props) {
  const router = useRouter();
  const [photos, setPhotos] = useState<ItemPhoto[]>(initial);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Keep the photos list in sync if the parent server component re-fetches.
  useEffect(() => {
    setPhotos(initial);
  }, [initial]);

  // The active hero is whichever photo is_primary, falling back to the
  // first photo or the legacy fallbackPrimary.
  const primary = photos.find((p) => p.is_primary) ?? photos[0] ?? null;
  const heroUrl = primary?.url ?? fallbackPrimary?.url ?? null;

  async function handleAdd(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setError(null);
    setUploading(true);
    try {
      const newPhotos: ItemPhoto[] = [];
      // Upload sequentially to keep server load (and the storage bucket's
      // upsert semantics) predictable. Most users add 1-3 photos at a time.
      for (const file of Array.from(files)) {
        const fd = new FormData();
        fd.append('file', file);
        const res = await fetch(`/api/items/${itemId}/photos`, {
          method: 'POST',
          body: fd,
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? 'Upload failed');
        newPhotos.push(json.photo as ItemPhoto);
      }
      setPhotos((arr) => [...arr, ...newPhotos]);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handleSetPrimary(photoId: string) {
    setError(null);
    try {
      const res = await fetch(`/api/items/${itemId}/photos/${photoId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_primary: true }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Update failed');
      setPhotos((arr) =>
        arr.map((p) => ({ ...p, is_primary: p.id === photoId }))
      );
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
    }
  }

  async function handleRemove(photoId: string) {
    if (!confirm('Remove this photo?')) return;
    setError(null);
    try {
      const res = await fetch(`/api/items/${itemId}/photos/${photoId}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? 'Delete failed');
      }
      setPhotos((arr) => arr.filter((p) => p.id !== photoId));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
  }

  return (
    <div className="space-y-3">
      <div
        className="card aspect-square overflow-hidden bg-brand-950/40 cursor-zoom-in relative group"
        onClick={() => heroUrl && setLightbox(Math.max(0, photos.findIndex((p) => p.id === primary?.id)))}
      >
        {heroUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={heroUrl} alt={itemName} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-brand-400">
            No photos yet
          </div>
        )}
        {photos.length > 0 && (
          <div className="absolute bottom-2 right-2 text-[10px] bg-black/50 text-white px-2 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity">
            Click to enlarge
          </div>
        )}
      </div>

      <div className="grid grid-cols-4 gap-2">
        {photos.map((p, idx) => {
          const isActive = p.id === primary?.id;
          return (
            <div
              key={p.id}
              className={`relative aspect-square rounded border overflow-hidden bg-brand-950/40 ${
                isActive ? 'border-accent ring-1 ring-accent' : 'border-brand-800'
              }`}
            >
              <button
                type="button"
                className="absolute inset-0 cursor-zoom-in"
                onClick={() => setLightbox(idx)}
                aria-label="Enlarge"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={p.thumb_url ?? p.url}
                  alt=""
                  className="w-full h-full object-cover"
                />
              </button>
              {isActive && (
                <span className="absolute top-1 left-1 text-[9px] bg-accent text-brand-950 font-semibold px-1.5 py-0.5 rounded">
                  Primary
                </span>
              )}
              <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent p-1 flex items-center justify-end gap-1 opacity-0 hover:opacity-100 transition-opacity">
                {!isActive && (
                  <button
                    type="button"
                    className="text-[10px] bg-black/60 text-white px-1.5 py-0.5 rounded hover:bg-black/80"
                    title="Make primary"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSetPrimary(p.id);
                    }}
                  >
                    Set primary
                  </button>
                )}
                {onScanPhoto && (
                  <button
                    type="button"
                    className="text-[10px] bg-black/60 text-accent px-1.5 py-0.5 rounded hover:bg-black/80"
                    title="Scan this close-up for serial / model number"
                    onClick={(e) => {
                      e.stopPropagation();
                      onScanPhoto(p);
                    }}
                  >
                    Scan
                  </button>
                )}
                <button
                  type="button"
                  className="text-[10px] bg-black/60 text-red-300 px-1.5 py-0.5 rounded hover:bg-black/80"
                  title="Remove"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemove(p.id);
                  }}
                >
                  ✕
                </button>
              </div>
            </div>
          );
        })}

        <label
          className={`aspect-square rounded border border-dashed flex flex-col items-center justify-center text-xs cursor-pointer transition-colors ${
            uploading
              ? 'border-brand-800 text-brand-500 cursor-wait'
              : 'border-brand-700 text-brand-300 hover:border-accent hover:text-accent'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            capture="environment"
            className="hidden"
            disabled={uploading}
            onChange={handleAdd}
          />
          {uploading ? 'Uploading…' : '+ Add photo'}
        </label>
      </div>

      {error && <div className="text-xs text-red-300">{error}</div>}

      {photos.length > 1 && (
        <p className="text-[11px] text-brand-400">
          Tip: hover a thumbnail to set as primary{onScanPhoto ? ', scan for a serial number,' : ''} or remove.
        </p>
      )}

      {lightbox != null && photos[lightbox] && (
        <Lightbox
          photos={photos}
          index={lightbox}
          onClose={() => setLightbox(null)}
          onChange={setLightbox}
        />
      )}
    </div>
  );
}

function Lightbox({
  photos,
  index,
  onClose,
  onChange,
}: {
  photos: ItemPhoto[];
  index: number;
  onClose: () => void;
  onChange: (n: number) => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') onChange((index + 1) % photos.length);
      if (e.key === 'ArrowLeft') onChange((index - 1 + photos.length) % photos.length);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, photos.length, onChange, onClose]);

  const photo = photos[index];
  return (
    <div
      className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <button
        type="button"
        className="absolute top-3 right-3 text-white/70 hover:text-white text-xl"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        aria-label="Close"
      >
        ✕
      </button>
      {photos.length > 1 && (
        <>
          <button
            type="button"
            className="absolute left-3 top-1/2 -translate-y-1/2 text-white/70 hover:text-white text-3xl px-3"
            onClick={(e) => {
              e.stopPropagation();
              onChange((index - 1 + photos.length) % photos.length);
            }}
            aria-label="Previous"
          >
            ‹
          </button>
          <button
            type="button"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-white/70 hover:text-white text-3xl px-3"
            onClick={(e) => {
              e.stopPropagation();
              onChange((index + 1) % photos.length);
            }}
            aria-label="Next"
          >
            ›
          </button>
        </>
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={photo.url}
        alt=""
        className="max-w-full max-h-full object-contain"
        onClick={(e) => e.stopPropagation()}
      />
      <div className="absolute bottom-3 inset-x-0 text-center text-white/70 text-xs">
        {index + 1} / {photos.length}
      </div>
    </div>
  );
}
