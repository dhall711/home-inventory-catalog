'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { Item } from '@/lib/types';
import { ItemCard, ItemListRow } from './ItemCard';

type ViewMode = 'grid' | 'list';

interface Props {
  items: Item[];
  total: number;
  page: number;
  pageSize: number;
  currency: string;
}

export function ItemsView({ items, total, page, pageSize, currency }: Props) {
  const [view, setView] = useState<ViewMode>('grid');
  const router = useRouter();
  const sp = useSearchParams();
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const goPage = (n: number) => {
    const params = new URLSearchParams(sp?.toString() ?? '');
    params.set('page', String(n));
    router.push(`/items?${params.toString()}`);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="text-sm text-brand-300">
          Showing {(items.length ? (page - 1) * pageSize + 1 : 0).toLocaleString()}–
          {((page - 1) * pageSize + items.length).toLocaleString()} of {total.toLocaleString()}
        </div>
        <div className="inline-flex rounded-md border border-brand-700 overflow-hidden text-sm">
          <button
            className={`px-3 py-1 ${view === 'grid' ? 'bg-brand-700' : 'bg-brand-900/40'}`}
            onClick={() => setView('grid')}
          >
            Grid
          </button>
          <button
            className={`px-3 py-1 ${view === 'list' ? 'bg-brand-700' : 'bg-brand-900/40'}`}
            onClick={() => setView('list')}
          >
            List
          </button>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="card p-10 text-center text-brand-300">
          No items match these filters.
        </div>
      ) : view === 'grid' ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {items.map((it) => <ItemCard key={it.id} item={it} currency={currency} />)}
        </div>
      ) : (
        <div className="card p-2 divide-y divide-brand-800">
          {items.map((it) => <ItemListRow key={it.id} item={it} currency={currency} />)}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex justify-center items-center gap-2 pt-2">
          <button className="btn-secondary" onClick={() => goPage(Math.max(1, page - 1))} disabled={page <= 1}>
            Previous
          </button>
          <span className="text-sm text-brand-300">
            Page {page} of {totalPages}
          </span>
          <button className="btn-secondary" onClick={() => goPage(Math.min(totalPages, page + 1))} disabled={page >= totalPages}>
            Next
          </button>
        </div>
      )}
    </div>
  );
}
