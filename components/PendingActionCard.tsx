'use client';

import { useState } from 'react';
import type { ChatActionRow } from '@/lib/chat/types';

interface Props {
  action: ChatActionRow;
  onDecided: (data: {
    new_messages?: unknown[];
    pending_actions?: ChatActionRow[];
    resumed: boolean;
  }) => void;
}

/**
 * Translate a tool_name + tool_input pair into a single-sentence preview
 * suitable for an approval card. Intentionally simple - the raw JSON is
 * always available in the expandable footer for users who want detail.
 */
function summarize(action: ChatActionRow): string {
  const i = action.tool_input as Record<string, unknown>;
  const ids = Array.isArray(i.item_ids) ? (i.item_ids as string[]) : [];
  switch (action.tool_name) {
    case 'create_item':
      return `Create item "${i.name ?? 'untitled'}"${i.category ? ` in ${i.category}` : ''}.`;
    case 'update_item':
      return `Update item ${i.item_id ?? ''} (${
        Object.keys(i).filter((k) => k !== 'item_id').join(', ') || 'no fields'
      }).`;
    case 'delete_item':
      return `Permanently delete item ${i.item_id ?? ''}. This cannot be undone.`;
    case 'move_item':
      return `Move item ${i.item_id ?? ''}${i.location_id ? ` to location ${i.location_id}` : ''}${
        i.collection_id ? ` into collection ${i.collection_id}` : ''
      }.`;
    case 'add_tags':
      return `Add tags ${JSON.stringify(i.tag_names ?? [])} to item ${i.item_id ?? ''}.`;
    case 'remove_tags':
      return `Remove tags ${JSON.stringify(i.tag_names ?? [])} from item ${i.item_id ?? ''}.`;
    case 'change_status':
      return `Change item ${i.item_id ?? ''} status to "${i.status ?? ''}".`;
    case 'bulk_move':
      return `Move ${ids.length} items${i.location_id ? ` to location ${i.location_id}` : ''}${
        i.collection_id ? ` into collection ${i.collection_id}` : ''
      }.`;
    case 'bulk_change_status':
      return `Change status of ${ids.length} items to "${i.status ?? ''}".`;
    case 'bulk_add_tags':
      return `Tag ${ids.length} items with ${JSON.stringify(i.tag_names ?? [])}.`;
    case 'estimate_value':
      return `Re-estimate market value for item ${i.item_id ?? ''} and save to history.`;
    default:
      return `Run ${action.tool_name}.`;
  }
}

const DESTRUCTIVE = new Set(['delete_item']);

export function PendingActionCard({ action, onDecided }: Props) {
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (action.status !== 'proposed') {
    const label =
      action.status === 'applied'
        ? '✓ Applied'
        : action.status === 'rejected'
        ? 'Declined'
        : action.status === 'failed'
        ? `Failed: ${action.error_text ?? 'unknown'}`
        : action.status;
    return (
      <div className="mt-2 rounded-md border border-brand-800 bg-brand-950/40 p-2 text-xs text-brand-400">
        {label}
      </div>
    );
  }

  async function decide(decision: 'approve' | 'reject') {
    setBusy(decision);
    setError(null);
    try {
      const res = await fetch(`/api/chat/actions/${action.id}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ decision }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'failed');
      onDecided(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed');
    } finally {
      setBusy(null);
    }
  }

  const destructive = DESTRUCTIVE.has(action.tool_name);

  return (
    <div
      className={`mt-2 rounded-md border p-3 text-sm space-y-2 ${
        destructive
          ? 'border-red-800/60 bg-red-950/30 text-red-100'
          : 'border-amber-800/60 bg-amber-950/30 text-amber-100'
      }`}
    >
      <div className="flex items-start gap-2">
        <span className="text-base leading-none">{destructive ? '⚠' : '?'}</span>
        <div className="flex-1">
          <div className="font-medium">{summarize(action)}</div>
          <button
            type="button"
            className="text-[11px] underline decoration-dotted underline-offset-2 opacity-70 hover:opacity-100 mt-1"
            onClick={() => setShowDetail((v) => !v)}
          >
            {showDetail ? 'Hide' : 'Show'} raw input
          </button>
          {showDetail && (
            <pre className="mt-1 text-[11px] bg-black/40 rounded p-2 overflow-x-auto">
              {JSON.stringify(action.tool_input, null, 2)}
            </pre>
          )}
        </div>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => decide('approve')}
          disabled={!!busy}
          className={`px-3 py-1.5 rounded text-sm font-medium ${
            destructive
              ? 'bg-red-600 hover:bg-red-500 text-white'
              : 'bg-emerald-600 hover:bg-emerald-500 text-white'
          } disabled:opacity-50`}
        >
          {busy === 'approve' ? 'Applying...' : destructive ? 'Yes, do it' : 'Approve'}
        </button>
        <button
          type="button"
          onClick={() => decide('reject')}
          disabled={!!busy}
          className="px-3 py-1.5 rounded text-sm border border-current/40 hover:bg-black/20 disabled:opacity-50"
        >
          {busy === 'reject' ? '...' : 'Decline'}
        </button>
      </div>
      {error && <div className="text-xs text-red-300">{error}</div>}
    </div>
  );
}
