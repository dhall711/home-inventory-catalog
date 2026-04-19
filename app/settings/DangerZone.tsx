'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface Props {
  householdName: string;
  isOwner: boolean;
}

export function DangerZone({ householdName, isOwner }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  if (!isOwner) return null;

  async function handleWipe() {
    setError(null);
    setSuccess(null);
    setBusy(true);
    try {
      const res = await fetch('/api/admin/wipe-household', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? 'Wipe failed');
      } else {
        setSuccess(`Deleted ${json.deleted_items ?? 0} items and all related data.`);
        setOpen(false);
        setConfirm('');
        router.refresh();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card border-red-900/60 p-5 space-y-3">
      <div>
        <h2 className="font-semibold text-red-300">Danger zone</h2>
        <p className="text-sm text-brand-300 mt-1">
          Permanently delete every item, photo, attachment, collection, location, tag, batch,
          and report in <strong>{householdName}</strong>. The household itself is kept so you can
          start fresh. This cannot be undone.
        </p>
      </div>

      {success && (
        <div className="bg-emerald-900/30 border border-emerald-800/50 rounded-md p-3 text-sm text-emerald-200">
          {success}
        </div>
      )}
      {error && (
        <div className="bg-red-900/30 border border-red-800/50 rounded-md p-3 text-sm text-red-200">
          {error}
        </div>
      )}

      {!open ? (
        <button
          className="btn-ghost text-red-300 border border-red-900/60 hover:bg-red-900/30"
          onClick={() => setOpen(true)}
        >
          Wipe all my data...
        </button>
      ) : (
        <div className="space-y-3 border border-red-900/60 rounded-md p-4 bg-red-900/10">
          <p className="text-sm">
            Type the household name <code className="px-1 bg-brand-900 rounded">{householdName}</code>{' '}
            to confirm.
          </p>
          <input
            className="input"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder={householdName}
            autoComplete="off"
          />
          <div className="flex gap-2">
            <button
              className="btn-primary bg-red-700 hover:bg-red-600 border-red-800"
              disabled={busy || confirm !== householdName}
              onClick={handleWipe}
            >
              {busy ? 'Wiping...' : 'Yes, delete everything'}
            </button>
            <button
              className="btn-ghost"
              onClick={() => {
                setOpen(false);
                setConfirm('');
                setError(null);
              }}
              disabled={busy}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
