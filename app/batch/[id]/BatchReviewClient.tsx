'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { BoundingBox, CategorySlug, Item } from '@/lib/types';
import { CATEGORIES } from '@/lib/types';
import { formatCurrency } from '@/lib/format';

interface Detection {
  item: Item;
  bbox: BoundingBox | null;
}

interface Props {
  batchId: string;
  sourceImageUrl: string;
  detections: Detection[];
}

export function BatchReviewClient({ batchId, sourceImageUrl, detections: initial }: Props) {
  const router = useRouter();
  const [detections, setDetections] = useState(initial);
  const [hovered, setHovered] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function patchItem(id: string, patch: Partial<Item>) {
    setDetections((arr) =>
      arr.map((d) => (d.item.id === id ? { ...d, item: { ...d.item, ...patch } } : d))
    );
  }

  async function saveItem(id: string, patch: Partial<Item> & { activate?: boolean }) {
    const payload: Record<string, unknown> = { ...patch };
    if (patch.activate) {
      payload.status = 'active';
      delete (payload as Record<string, unknown>).activate;
    }
    const res = await fetch(`/api/items/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert(j.error ?? 'Save failed');
    }
  }

  function handleConfirm(d: Detection) {
    start(async () => {
      await saveItem(d.item.id, { status: 'active' });
      patchItem(d.item.id, { status: 'active' });
      router.refresh();
    });
  }

  function handleReject(d: Detection) {
    if (!confirm('Discard this detected item?')) return;
    start(async () => {
      await fetch(`/api/items/${d.item.id}`, { method: 'DELETE' });
      setDetections((arr) => arr.filter((x) => x.item.id !== d.item.id));
      router.refresh();
    });
  }

  async function handleConfirmAll() {
    if (!confirm(`Activate all ${detections.filter((d) => d.item.status === 'review').length} draft items?`)) return;
    start(async () => {
      await Promise.all(
        detections.filter((d) => d.item.status === 'review').map((d) => saveItem(d.item.id, { status: 'active' }))
      );
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <Link href="/batch" className="text-sm text-brand-300 hover:text-brand-100">&larr; All batches</Link>
        <button onClick={handleConfirmAll} className="btn-primary" disabled={pending || detections.length === 0}>
          Confirm all
        </button>
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1fr)_400px] gap-4">
        <div className="card overflow-hidden relative">
          <div className="relative">
            <img src={sourceImageUrl} alt="batch source" className="w-full block" />
            {detections.map((d) =>
              d.bbox ? (
                <div
                  key={d.item.id}
                  className={`absolute border-2 ${
                    hovered === d.item.id ? 'border-accent bg-accent/20' : 'border-brand-300/80'
                  } pointer-events-none`}
                  style={{
                    left: `${(d.bbox.x ?? 0) * 100}%`,
                    top: `${(d.bbox.y ?? 0) * 100}%`,
                    width: `${(d.bbox.width ?? 0) * 100}%`,
                    height: `${(d.bbox.height ?? 0) * 100}%`,
                  }}
                >
                  <span className="absolute -top-5 left-0 text-xs bg-brand-950/80 px-1 rounded">
                    {d.item.name}
                  </span>
                </div>
              ) : null
            )}
          </div>
        </div>

        <div className="space-y-2 max-h-[80vh] overflow-y-auto pr-1">
          <div className="text-sm text-brand-300">
            {detections.length} detected • batch <span className="text-brand-400">{batchId.slice(0, 8)}</span>
          </div>
          {detections.length === 0 && (
            <div className="card p-4 text-sm text-brand-300">No items in this batch.</div>
          )}
          {detections.map((d) => (
            <div
              key={d.item.id}
              className="card p-3 space-y-2"
              onMouseEnter={() => setHovered(d.item.id)}
              onMouseLeave={() => setHovered(null)}
            >
              <div className="flex items-center gap-2">
                <input
                  className="input flex-1 text-sm"
                  value={d.item.name}
                  onChange={(e) => patchItem(d.item.id, { name: e.target.value })}
                  onBlur={() => saveItem(d.item.id, { name: d.item.name })}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <select
                  className="input text-sm"
                  value={d.item.category}
                  onChange={(e) => {
                    const v = e.target.value as CategorySlug;
                    patchItem(d.item.id, { category: v });
                    saveItem(d.item.id, { category: v });
                  }}
                >
                  {CATEGORIES.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
                </select>
                <input
                  type="number"
                  step="0.01"
                  className="input text-sm"
                  placeholder="Value"
                  value={d.item.current_value ?? ''}
                  onChange={(e) =>
                    patchItem(d.item.id, {
                      current_value: e.target.value === '' ? null : Number(e.target.value),
                    })
                  }
                  onBlur={() =>
                    saveItem(d.item.id, {
                      current_value: d.item.current_value,
                      current_value_source: 'manual',
                      current_value_updated_at: new Date().toISOString(),
                    })
                  }
                />
              </div>
              <div className="text-xs text-brand-300">{d.item.description}</div>
              <div className="flex items-center justify-between text-xs">
                <div className="text-brand-400">
                  {d.item.current_value != null && formatCurrency(d.item.current_value, 'USD')}
                  {d.item.ai_confidence != null && ` • ${Math.round(d.item.ai_confidence * 100)}% conf.`}
                </div>
                <div className="flex items-center gap-2">
                  <Link href={`/items/${d.item.id}/edit`} className="text-brand-300 hover:text-brand-100">Edit detail</Link>
                  <button onClick={() => handleConfirm(d)} className="btn-primary !py-1 !px-2 text-xs" disabled={pending || d.item.status === 'active'}>
                    {d.item.status === 'active' ? 'Confirmed' : 'Confirm'}
                  </button>
                  <button onClick={() => handleReject(d)} className="btn-ghost !py-1 !px-2 text-xs text-red-300" disabled={pending}>
                    Reject
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
