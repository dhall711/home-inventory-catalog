'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AttachmentKind, ItemAttachment } from '@/lib/types';
import type { ReceiptExtraction } from '@/lib/ai-receipt';
import { formatDate } from '@/lib/format';
import { ReceiptApplyDialog, type ItemSnapshot } from './ReceiptApplyDialog';

const KINDS: AttachmentKind[] = ['receipt', 'appraisal', 'manual', 'other'];

// Kinds we know how to AI-extract today. Appraisals could come next.
const EXTRACTABLE: AttachmentKind[] = ['receipt'];

interface Props {
  itemId: string;
  initial: ItemAttachment[];
  itemSnapshot?: ItemSnapshot;
  category?: string | null;
}

export function AttachmentsPanel({ itemId, initial, itemSnapshot, category }: Props) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [kind, setKind] = useState<AttachmentKind>('receipt');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [extractingId, setExtractingId] = useState<string | null>(null);
  const [pendingExtraction, setPendingExtraction] = useState<{
    attachmentId: string;
    extraction: ReceiptExtraction;
  } | null>(null);

  async function runExtraction(attachmentId: string) {
    if (!itemSnapshot) {
      setError('Cannot extract: missing item context.');
      return;
    }
    setError(null);
    setExtractingId(attachmentId);
    try {
      const res = await fetch('/api/extract-receipt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attachment_id: attachmentId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Extract failed');
      setPendingExtraction({
        attachmentId,
        extraction: json.extraction as ReceiptExtraction,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Extract failed');
    } finally {
      setExtractingId(null);
    }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('item_id', itemId);
      fd.append('kind', kind);
      const res = await fetch('/api/upload/attachment', { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Upload failed');
      const newAttachment = json.attachment as ItemAttachment;
      setItems((arr) => [newAttachment, ...arr]);
      router.refresh();
      // Auto-extract for receipts (and other future supported kinds) so
      // the user gets the confirm dialog without an extra click.
      if (EXTRACTABLE.includes(kind) && itemSnapshot) {
        await runExtraction(newAttachment.id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setBusy(false);
      e.target.value = '';
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Remove this attachment?')) return;
    const res = await fetch(`/api/attachments/${id}`, { method: 'DELETE' });
    if (res.ok) setItems((arr) => arr.filter((a) => a.id !== id));
  }

  async function openSigned(id: string) {
    const res = await fetch(`/api/attachments/${id}/url`);
    const j = await res.json();
    if (j.url) window.open(j.url, '_blank');
  }

  return (
    <div className="card p-4 space-y-3">
      <div className="text-sm font-medium">Attachments</div>
      <div className="flex items-center gap-2 text-sm">
        <select
          className="input flex-shrink-0 w-32"
          value={kind}
          onChange={(e) => setKind(e.target.value as AttachmentKind)}
        >
          {KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
        </select>
        <input type="file" onChange={handleUpload} disabled={busy} className="text-xs flex-1" />
      </div>
      {kind === 'receipt' && itemSnapshot && (
        <p className="text-[11px] text-brand-400">
          Receipts are auto-scanned for vendor, date, price, serial &amp; model.
          You confirm before anything is saved.
        </p>
      )}
      {busy && <div className="text-xs text-brand-300">Uploading...</div>}
      {extractingId && <div className="text-xs text-brand-300">Reading receipt with AI...</div>}
      {error && <div className="text-xs text-red-300">{error}</div>}
      {items.length === 0 ? (
        <div className="text-xs text-brand-400">None yet.</div>
      ) : (
        <ul className="divide-y divide-brand-800 text-sm">
          {items.map((a) => (
            <li key={a.id} className="py-1.5 flex items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <button
                  onClick={() => openSigned(a.id)}
                  className="text-brand-100 hover:text-accent truncate text-left block w-full"
                >
                  {a.filename ?? 'attachment'}
                </button>
                <div className="text-xs text-brand-400">
                  {a.kind} • {formatDate(a.uploaded_at)}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {EXTRACTABLE.includes(a.kind) && itemSnapshot && (
                  <button
                    type="button"
                    className="text-xs text-accent hover:opacity-80 disabled:opacity-50"
                    disabled={extractingId === a.id}
                    onClick={() => runExtraction(a.id)}
                  >
                    {extractingId === a.id ? 'Reading…' : 'Extract'}
                  </button>
                )}
                <button
                  className="text-xs text-red-300 hover:text-red-200"
                  onClick={() => handleDelete(a.id)}
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {pendingExtraction && itemSnapshot && (
        <ReceiptApplyDialog
          itemId={itemId}
          category={category ?? null}
          current={itemSnapshot}
          extraction={pendingExtraction.extraction}
          onClose={() => setPendingExtraction(null)}
          onApplied={() => router.refresh()}
        />
      )}
    </div>
  );
}
