'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { prepareImageForUpload, readJsonOrThrow } from '@/lib/client/image';

export function BatchUploadClient() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      setStatus('Preparing photo...');
      const prepared = await prepareImageForUpload(file);

      setStatus('Uploading photo...');
      const fd = new FormData();
      fd.append('file', prepared);
      const upRes = await fetch('/api/upload/photo', { method: 'POST', body: fd });
      const up = await readJsonOrThrow<{ url: string }>(upRes, 'Upload');

      setStatus('Identifying items with AI (this can take 30-60s)...');
      const res = await fetch('/api/analyze-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_url: up.url }),
      });
      const json = await readJsonOrThrow<{ batch_id: string }>(res, 'Analyze');
      router.push(`/batch/${json.batch_id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setBusy(false);
      setStatus('');
    }
  }

  return (
    <div className="card p-6 space-y-3">
      <input type="file" accept="image/*" onChange={handleFile} disabled={busy} />
      {status && <div className="text-sm text-brand-300">{status}</div>}
      {error && <div className="text-sm text-red-300">{error}</div>}
    </div>
  );
}
