'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { CategorySlug, Item } from '@/lib/types';
import { CATEGORIES } from '@/lib/types';
import { formatCurrency } from '@/lib/format';

interface SelectOption { id: string; name: string }

interface CommonProps {
  item: Item;
  currency: string;
  /** When defined, render in select mode and call back on toggle. */
  selected?: boolean;
  onToggleSelect?: (item: Item) => void;
}

export function ItemCard({ item, currency, selected, onToggleSelect }: CommonProps) {
  const selectMode = onToggleSelect !== undefined;
  const content = (
    <>
      <div className="aspect-square bg-brand-950/60 flex items-center justify-center overflow-hidden relative">
        {item.primary_photo_thumb_url || item.primary_photo_url ? (
          <img
            src={item.primary_photo_thumb_url ?? item.primary_photo_url ?? ''}
            alt={item.name}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="text-brand-500 text-xs">No photo</div>
        )}
        {selectMode && (
          <div
            className={`absolute top-1.5 left-1.5 w-5 h-5 rounded-full flex items-center justify-center text-[11px] border-2 ${
              selected ? 'bg-brand-500 border-brand-300 text-white' : 'bg-brand-950/80 border-brand-300 text-transparent'
            }`}
          >
            ✓
          </div>
        )}
      </div>
      <div className="p-3 space-y-1 flex-1 flex flex-col">
        <div className="font-medium text-sm line-clamp-2">{item.name}</div>
        <div className="text-xs text-brand-300 capitalize">{item.category.replace('_', ' ')}</div>
        <div className="mt-auto text-sm font-semibold text-accent">
          {item.current_value != null ? formatCurrency(item.current_value, currency) : '—'}
        </div>
      </div>
    </>
  );

  if (selectMode) {
    return (
      <button
        type="button"
        onClick={() => onToggleSelect?.(item)}
        className={`card overflow-hidden flex flex-col text-left hover:border-brand-500 transition-colors ${
          selected ? 'ring-2 ring-brand-400 border-brand-400' : ''
        }`}
      >
        {content}
      </button>
    );
  }

  return (
    <Link
      href={`/items/${item.id}`}
      className="card overflow-hidden flex flex-col hover:border-brand-500 transition-colors"
    >
      {content}
    </Link>
  );
}

interface ListRowProps extends CommonProps {
  /** Editable cells: when these are passed, name/category/location render inline editors that PATCH on blur. */
  editable?: {
    locations: SelectOption[];
  };
}

export function ItemListRow({ item, currency, selected, onToggleSelect, editable }: ListRowProps) {
  const router = useRouter();
  const selectMode = onToggleSelect !== undefined;
  const [name, setName] = useState(item.name);
  const [category, setCategory] = useState<CategorySlug>(item.category);
  const [locationId, setLocationId] = useState(item.location_id ?? '');
  const [savingField, setSavingField] = useState<string | null>(null);
  const [editingName, setEditingName] = useState(false);

  async function patch(field: string, payload: Record<string, unknown>) {
    setSavingField(field);
    try {
      const res = await fetch(`/api/items/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        // Roll back the visible change so the user notices.
        const json = await res.json();
        console.warn('PATCH failed', json.error);
      }
      router.refresh();
    } finally {
      setSavingField(null);
    }
  }

  return (
    <div
      className={`flex items-center gap-3 p-2 rounded-md hover:bg-brand-800/50 border transition-colors ${
        selected ? 'border-brand-400 bg-brand-700/20' : 'border-transparent'
      }`}
    >
      {selectMode && (
        <input
          type="checkbox"
          className="h-4 w-4 cursor-pointer flex-shrink-0"
          checked={!!selected}
          onChange={() => onToggleSelect?.(item)}
          aria-label={`Select ${item.name}`}
        />
      )}
      <Link href={`/items/${item.id}`} className="w-12 h-12 flex-shrink-0 bg-brand-950 rounded overflow-hidden">
        {item.primary_photo_thumb_url || item.primary_photo_url ? (
          <img
            src={item.primary_photo_thumb_url ?? item.primary_photo_url ?? ''}
            alt={item.name}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : null}
      </Link>
      <div className="flex-1 min-w-0 grid grid-cols-1 sm:grid-cols-[2fr_1fr_1fr] gap-2 items-center">
        {/* Name cell */}
        {editable && editingName ? (
          <input
            className="input text-sm py-1"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => {
              setEditingName(false);
              if (name !== item.name && name.trim()) patch('name', { name: name.trim() });
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              if (e.key === 'Escape') {
                setName(item.name);
                setEditingName(false);
              }
            }}
          />
        ) : (
          <div className="min-w-0">
            <Link
              href={`/items/${item.id}`}
              className="text-sm truncate block hover:underline"
              onClick={(e) => {
                if (editable) {
                  e.preventDefault();
                  setEditingName(true);
                }
              }}
              title={editable ? 'Click to rename' : item.name}
            >
              {name}
            </Link>
            <div className="text-xs text-brand-400 truncate">
              {item.serial_number ? `SN: ${item.serial_number}` : ''}
            </div>
          </div>
        )}

        {/* Category cell */}
        {editable ? (
          <select
            className="input text-xs py-1"
            value={category}
            disabled={savingField === 'category'}
            onChange={(e) => {
              const v = e.target.value as CategorySlug;
              setCategory(v);
              patch('category', { category: v });
            }}
          >
            {CATEGORIES.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
          </select>
        ) : (
          <div className="text-xs text-brand-300 truncate capitalize">{item.category.replace('_', ' ')}</div>
        )}

        {/* Location cell */}
        {editable ? (
          <select
            className="input text-xs py-1"
            value={locationId}
            disabled={savingField === 'location'}
            onChange={(e) => {
              const v = e.target.value;
              setLocationId(v);
              patch('location', { location_id: v || null });
            }}
          >
            <option value="">—</option>
            {editable.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        ) : null}
      </div>
      <div className="text-sm font-semibold text-accent w-24 text-right flex-shrink-0">
        {item.current_value != null ? formatCurrency(item.current_value, currency) : '—'}
      </div>
    </div>
  );
}
