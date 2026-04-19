'use client';

import { useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { Item } from '@/lib/types';
import { ItemCard, ItemListRow } from './ItemCard';
import { BulkActionBar } from './BulkActionBar';

interface SelectOption { id: string; name: string }

type ViewMode = 'grid' | 'list';

interface Props {
  items: Item[];
  total: number;
  page: number;
  pageSize: number;
  currency: string;
  locations?: SelectOption[];
  collections?: SelectOption[];
}

export function ItemsView({ items, total, page, pageSize, currency, locations = [], collections = [] }: Props) {
  const [view, setView] = useState<ViewMode>('grid');
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const router = useRouter();
  const sp = useSearchParams();
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const goPage = (n: number) => {
    const params = new URLSearchParams(sp?.toString() ?? '');
    params.set('page', String(n));
    router.push(`/items?${params.toString()}`);
  };

  function toggle(it: Item) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(it.id)) next.delete(it.id);
      else next.add(it.id);
      return next;
    });
  }

  function toggleAll() {
    if (selectedIds.size === items.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(items.map((i) => i.id)));
  }

  const selectedArray = useMemo(() => Array.from(selectedIds), [selectedIds]);

  return (
    <div className="space-y-4 pb-24">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="text-sm text-brand-300">
          Showing {(items.length ? (page - 1) * pageSize + 1 : 0).toLocaleString()}–
          {((page - 1) * pageSize + items.length).toLocaleString()} of {total.toLocaleString()}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setSelectMode((v) => {
                if (v) setSelectedIds(new Set());
                return !v;
              });
            }}
            className={`text-xs px-2.5 py-1 rounded-md border transition-colors ${
              selectMode
                ? 'bg-brand-700 border-brand-600 text-white'
                : 'border-brand-700 text-brand-200 hover:bg-brand-800'
            }`}
          >
            {selectMode ? 'Done selecting' : 'Select'}
          </button>
          {selectMode && items.length > 0 && (
            <button type="button" onClick={toggleAll} className="text-xs text-brand-300 hover:text-brand-100">
              {selectedIds.size === items.length ? 'Deselect all' : 'Select all on page'}
            </button>
          )}
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
      </div>

      {items.length === 0 ? (
        <div className="card p-10 text-center text-brand-300">
          No items match these filters.
        </div>
      ) : view === 'grid' ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {items.map((it) => (
            <ItemCard
              key={it.id}
              item={it}
              currency={currency}
              selected={selectMode ? selectedIds.has(it.id) : undefined}
              onToggleSelect={selectMode ? toggle : undefined}
            />
          ))}
        </div>
      ) : (
        <div className="card p-2 divide-y divide-brand-800">
          {items.map((it) => (
            <ItemListRow
              key={it.id}
              item={it}
              currency={currency}
              selected={selectMode ? selectedIds.has(it.id) : undefined}
              onToggleSelect={selectMode ? toggle : undefined}
              editable={!selectMode ? { locations } : undefined}
            />
          ))}
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

      <BulkActionBar
        selectedIds={selectedArray}
        locations={locations}
        collections={collections}
        onClear={() => setSelectedIds(new Set())}
      />
    </div>
  );
}
