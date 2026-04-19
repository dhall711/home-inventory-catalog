'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { CategorySlug } from '@/lib/types';

export function ItemActions({ itemId, category }: { itemId: string; category: CategorySlug }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState(false);

  function handleDelete() {
    if (!confirm('Delete this item permanently?')) return;
    start(async () => {
      await fetch(`/api/items/${itemId}`, { method: 'DELETE' });
      router.push('/items');
      router.refresh();
    });
  }

  async function handleRefreshValue() {
    setBusy(true);
    try {
      const res = await fetch('/api/estimate-value', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_id: itemId, category }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(j.error ?? 'Failed to refresh value');
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex gap-2">
      <button onClick={handleRefreshValue} className="btn-secondary" disabled={busy}>
        {busy ? 'Estimating...' : 'Refresh AI value'}
      </button>
      <button onClick={handleDelete} className="btn-ghost text-red-300" disabled={pending}>
        Delete
      </button>
    </div>
  );
}
