import type { AttachmentKind } from '@/lib/types';
import type { DocumentExtraction } from '@/lib/ai-document';

/**
 * Pre-save extras that we collect on the new-item screen and need to keep
 * around when the user toggles between the "Quick confirm" and the full
 * "Add more details" form. They live in NewItemClient so neither view
 * loses anything when the other unmounts.
 */

export interface PendingDoc {
  id: string;
  file: File;
  kind: AttachmentKind;
  status: 'extracting' | 'awaiting_confirm' | 'applied' | 'no_extraction' | 'error' | 'queued';
  appliedFieldCount?: number;
  errorMsg?: string;
  extraction?: DocumentExtraction;
  /** Snapshot of values the user accepted from this document. Tracked
   *  per-doc so we can show what each doc contributed. */
  applied?: { fields: Record<string, unknown>; attributes: Record<string, unknown> };
}

export interface PendingHistory {
  value: number;
  source: 'receipt' | 'appraisal';
  dated_on: string;
  notes: string | null;
}

export interface PendingPhoto {
  id: string;
  name: string;
  status: 'uploading' | 'ready' | 'error';
  url?: string;
  thumb_url?: string;
  errorMsg?: string;
}

export interface ItemExtrasState {
  /** Direct items.* column overrides accepted from documents/scans. */
  extraDraft: Record<string, unknown>;
  /** Per-category attribute overrides accepted from documents/scans. */
  extraAttributes: Record<string, unknown>;
  pendingDocs: PendingDoc[];
  pendingPhotos: PendingPhoto[];
  pendingHistory: PendingHistory[];
}

export const EMPTY_EXTRAS: ItemExtrasState = {
  extraDraft: {},
  extraAttributes: {},
  pendingDocs: [],
  pendingPhotos: [],
  pendingHistory: [],
};

let docCounter = 0;
let photoCounter = 0;
export const nextDocId = () => `doc-${++docCounter}`;
export const nextPhotoId = () => `photo-${++photoCounter}`;
