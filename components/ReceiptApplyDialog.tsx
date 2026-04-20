'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ReceiptExtraction } from '@/lib/ai-receipt';

export interface ItemSnapshot {
  acquired_date: string | null;
  acquired_from: string | null;
  acquired_price: number | null;
  current_value: number | null;
  manufacturer: string | null;
  model: string | null;
  serial_number: string | null;
  notes: string | null;
}

interface Props {
  itemId: string;
  category: string | null;
  current: ItemSnapshot;
  extraction: ReceiptExtraction;
  onClose: () => void;
  onApplied?: () => void;
}

interface Row {
  key: keyof ItemSnapshot | 'warranty_until';
  label: string;
  current: string | number | null;
  next: string;
  apply: boolean;
  type: 'text' | 'number' | 'date';
  attribute?: boolean;          // true = goes into category attributes table
  attributeKey?: string;
}

/**
 * "Full actions with confirmation" UI for receipt extraction.
 *
 * Built from the parsed receipt + the item's current values. The user
 * checks per-field, can edit any value before applying, and we PATCH the
 * item once. Unchanged or unchecked fields are not sent.
 */
export function ReceiptApplyDialog({
  itemId,
  category,
  current,
  extraction,
  onClose,
  onApplied,
}: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logToHistory, setLogToHistory] = useState(true);

  const initialRows = useMemo<Row[]>(() => {
    const r: Row[] = [];
    const push = (
      key: Row['key'],
      label: string,
      currentVal: Row['current'],
      nextVal: string | number | null,
      type: Row['type'],
      opts?: { attribute?: boolean; attributeKey?: string }
    ) => {
      const next = nextVal == null ? '' : String(nextVal);
      if (!next) return; // nothing extracted for this field
      const isEmpty = currentVal == null || currentVal === '';
      r.push({
        key,
        label,
        current: currentVal,
        next,
        apply: isEmpty || String(currentVal) !== next, // default-on if it would change something
        type,
        attribute: opts?.attribute,
        attributeKey: opts?.attributeKey,
      });
    };
    push('acquired_date', 'Acquired date', current.acquired_date, extraction.purchase_date, 'date');
    push('acquired_price', 'Acquired price', current.acquired_price, extraction.total, 'number');
    push('acquired_from', 'Acquired from (vendor)', current.acquired_from, extraction.vendor, 'text');
    push('manufacturer', 'Manufacturer', current.manufacturer, extraction.manufacturer, 'text');
    push('model', 'Model', current.model, extraction.model, 'text');
    push('serial_number', 'Serial number', current.serial_number, extraction.serial_number, 'text');
    if (extraction.warranty_until && category === 'electronics') {
      push('warranty_until', 'Warranty until', null, extraction.warranty_until, 'date', {
        attribute: true,
        attributeKey: 'warranty_until',
      });
    }
    if (extraction.notes) {
      const merged = current.notes
        ? `${current.notes}\n\nFrom receipt: ${extraction.notes}`
        : extraction.notes;
      push('notes', 'Notes (appended)', current.notes, merged, 'text');
    }
    return r;
  }, [current, extraction, category]);

  const [rows, setRows] = useState<Row[]>(initialRows);
  useEffect(() => setRows(initialRows), [initialRows]);

  const nothingToApply = rows.length === 0;

  async function handleApply() {
    setError(null);
    setBusy(true);
    try {
      const fields: Record<string, unknown> = {};
      const attributes: Record<string, unknown> = {};
      for (const r of rows) {
        if (!r.apply) continue;
        const val =
          r.type === 'number'
            ? r.next === ''
              ? null
              : Number(r.next)
            : r.next || null;
        if (r.attribute && r.attributeKey) {
          attributes[r.attributeKey] = val;
        } else {
          fields[r.key as string] = val;
        }
      }
      // Tag the price as 'receipt' so the source column reflects provenance.
      const priceRow = rows.find((r) => r.key === 'acquired_price' && r.apply);
      if (priceRow) {
        // Only set value source if not already set, OR force to 'receipt'
        // since a receipt is more authoritative than a manual estimate.
        fields.current_value = fields.acquired_price ?? null;
        fields.current_value_source = 'receipt';
        fields.current_value_updated_at = new Date().toISOString();
      }

      const patchBody: Record<string, unknown> = { ...fields };
      if (Object.keys(attributes).length > 0) patchBody.attributes = attributes;

      if (Object.keys(fields).length > 0 || Object.keys(attributes).length > 0) {
        const res = await fetch(`/api/items/${itemId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patchBody),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? 'Update failed');
      }

      // Optionally drop a value-history point for the receipt purchase price.
      if (logToHistory && priceRow && extraction.purchase_date) {
        await fetch('/api/value-history', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            item_id: itemId,
            value: Number(priceRow.next),
            source: 'receipt',
            dated_on: extraction.purchase_date,
            notes: extraction.vendor ? `Purchased from ${extraction.vendor}` : 'Receipt purchase',
          }),
        }).catch(() => {
          // Non-fatal: the field write already succeeded.
        });
      }

      onApplied?.();
      router.refresh();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to apply');
    } finally {
      setBusy(false);
    }
  }

  const conf =
    extraction.confidence != null ? `${Math.round(extraction.confidence * 100)}%` : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="card w-full max-w-2xl max-h-[90vh] overflow-y-auto p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Apply receipt details</h2>
            <p className="text-xs text-brand-300 mt-1">
              We extracted the fields below. Pick which ones to apply, then confirm.
              {conf && <> AI confidence: {conf}.</>}
            </p>
          </div>
          <button
            type="button"
            className="btn-ghost text-xs"
            onClick={onClose}
            disabled={busy}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {nothingToApply ? (
          <div className="bg-brand-800/40 border border-brand-700 rounded p-4 text-sm">
            The model couldn&apos;t pull anything useful out of this receipt.
            You can still keep the file as a reference attachment.
          </div>
        ) : (
          <>
            <div className="space-y-2">
              {rows.map((row, idx) => (
                <div
                  key={row.key + idx}
                  className="grid grid-cols-[20px_140px_1fr] gap-2 items-center text-sm border-b border-brand-800 pb-2"
                >
                  <input
                    type="checkbox"
                    checked={row.apply}
                    onChange={(e) =>
                      setRows((rs) => rs.map((r, i) => (i === idx ? { ...r, apply: e.target.checked } : r)))
                    }
                  />
                  <div className="text-brand-300">
                    <div>{row.label}</div>
                    {row.current != null && row.current !== '' && (
                      <div className="text-[10px] text-brand-500 truncate" title={String(row.current)}>
                        was: {String(row.current)}
                      </div>
                    )}
                  </div>
                  {row.type === 'text' && (row.key === 'notes' || row.next.length > 60) ? (
                    <textarea
                      className="input min-h-[60px]"
                      value={row.next}
                      disabled={!row.apply}
                      onChange={(e) =>
                        setRows((rs) => rs.map((r, i) => (i === idx ? { ...r, next: e.target.value } : r)))
                      }
                    />
                  ) : (
                    <input
                      type={row.type === 'number' ? 'number' : row.type === 'date' ? 'date' : 'text'}
                      step={row.type === 'number' ? '0.01' : undefined}
                      className="input"
                      value={row.next}
                      disabled={!row.apply}
                      onChange={(e) =>
                        setRows((rs) => rs.map((r, i) => (i === idx ? { ...r, next: e.target.value } : r)))
                      }
                    />
                  )}
                </div>
              ))}
            </div>

            {rows.some((r) => r.key === 'acquired_price' && r.apply) && (
              <label className="flex items-center gap-2 text-xs text-brand-300">
                <input
                  type="checkbox"
                  checked={logToHistory}
                  onChange={(e) => setLogToHistory(e.target.checked)}
                />
                <span>
                  Also log this price as a value-history entry on the purchase date.
                </span>
              </label>
            )}
          </>
        )}

        {error && (
          <div className="text-sm text-red-200 bg-red-900/30 border border-red-800/50 rounded-md p-2">
            {error}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-brand-800">
          <button type="button" className="btn-ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          {!nothingToApply && (
            <button
              type="button"
              className="btn-primary"
              disabled={busy || !rows.some((r) => r.apply)}
              onClick={handleApply}
            >
              {busy ? 'Applying...' : 'Apply to item'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
