'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AttachmentKind, ItemAttachment } from '@/lib/types';
import { formatDate } from '@/lib/format';

const KINDS: AttachmentKind[] = ['receipt', 'appraisal', 'manual', 'other'];

export function AttachmentsPanel({ itemId, initial }: { itemId: string; initial: ItemAttachment[] }) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [kind, setKind] = useState<AttachmentKind>('receipt');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      setItems((arr) => [json.attachment, ...arr]);
      router.refresh();
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
        <select className="input flex-shrink-0 w-32" value={kind} onChange={(e) => setKind(e.target.value as AttachmentKind)}>
          {KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
        </select>
        <input type="file" onChange={handleUpload} disabled={busy} className="text-xs flex-1" />
      </div>
      {error && <div className="text-xs text-red-300">{error}</div>}
      {items.length === 0 ? (
        <div className="text-xs text-brand-400">None yet.</div>
      ) : (
        <ul className="divide-y divide-brand-800 text-sm">
          {items.map((a) => (
            <li key={a.id} className="py-1.5 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <button onClick={() => openSigned(a.id)} className="text-brand-100 hover:text-accent truncate text-left">
                  {a.filename ?? 'attachment'}
                </button>
                <div className="text-xs text-brand-400">{a.kind} • {formatDate(a.uploaded_at)}</div>
              </div>
              <button className="text-xs text-red-300 hover:text-red-200" onClick={() => handleDelete(a.id)}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
