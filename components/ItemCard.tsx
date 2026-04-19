import Link from 'next/link';
import type { Item } from '@/lib/types';
import { formatCurrency } from '@/lib/format';

export function ItemCard({ item, currency }: { item: Item; currency: string }) {
  return (
    <Link
      href={`/items/${item.id}`}
      className="card overflow-hidden flex flex-col hover:border-brand-500 transition-colors"
    >
      <div className="aspect-square bg-brand-950/60 flex items-center justify-center overflow-hidden">
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
      </div>
      <div className="p-3 space-y-1 flex-1 flex flex-col">
        <div className="font-medium text-sm line-clamp-2">{item.name}</div>
        <div className="text-xs text-brand-300 capitalize">{item.category.replace('_', ' ')}</div>
        <div className="mt-auto text-sm font-semibold text-accent">
          {item.current_value != null ? formatCurrency(item.current_value, currency) : '—'}
        </div>
      </div>
    </Link>
  );
}

export function ItemListRow({ item, currency }: { item: Item; currency: string }) {
  return (
    <Link
      href={`/items/${item.id}`}
      className="flex items-center gap-3 p-2 rounded-md hover:bg-brand-800/50 border border-transparent hover:border-brand-700"
    >
      <div className="w-12 h-12 flex-shrink-0 bg-brand-950 rounded overflow-hidden">
        {item.primary_photo_thumb_url || item.primary_photo_url ? (
          <img
            src={item.primary_photo_thumb_url ?? item.primary_photo_url ?? ''}
            alt={item.name}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : null}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm truncate">{item.name}</div>
        <div className="text-xs text-brand-400 truncate">
          {item.category} {item.serial_number ? `• ${item.serial_number}` : ''}
        </div>
      </div>
      <div className="text-sm font-semibold text-accent w-24 text-right">
        {item.current_value != null ? formatCurrency(item.current_value, currency) : '—'}
      </div>
    </Link>
  );
}
