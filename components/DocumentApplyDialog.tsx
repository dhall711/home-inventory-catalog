'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { DocumentExtraction } from '@/lib/ai-document';
import type { AttachmentKind, CategorySlug } from '@/lib/types';

/**
 * The subset of item fields the dialog cares about. We use this to render
 * the "was: X" hint next to each row and to decide which extracted fields
 * are actually changes worth surfacing.
 */
export interface ItemSnapshot {
  acquired_date: string | null;
  acquired_from: string | null;
  acquired_price: number | null;
  current_value: number | null;
  manufacturer: string | null;
  model: string | null;
  serial_number: string | null;
  notes: string | null;
  description?: string | null;
  condition?: string | null;
}

/**
 * Suggested updates produced by the dialog when used in "callback" mode
 * (no item exists yet, e.g. the new-item flow). The caller merges these
 * into the draft they're collecting before POSTing /api/items.
 */
export interface DocumentApplyResult {
  /** Direct columns on the items table. */
  fields: Record<string, unknown>;
  /** Per-category attribute upserts (writes via attributes blob on the items API). */
  attributes: Record<string, unknown>;
  /** Optional value-history entry to log after the item is created. */
  valueHistoryEntry: {
    value: number;
    source: 'receipt' | 'appraisal';
    dated_on: string;
    notes: string | null;
  } | null;
}

interface BaseProps {
  kind: AttachmentKind;
  category: CategorySlug | string | null;
  current: ItemSnapshot;
  extraction: DocumentExtraction;
  onClose: () => void;
}

interface PatchModeProps extends BaseProps {
  mode?: 'patch';
  itemId: string;
  onApplied?: () => void;
}

interface CallbackModeProps extends BaseProps {
  mode: 'callback';
  itemId?: never;
  onApply: (result: DocumentApplyResult) => void;
}

type Props = PatchModeProps | CallbackModeProps;

interface Row {
  /** Maps to an items-table column, or to "_attribute" when attribute=true. */
  key: string;
  label: string;
  current: string | number | null;
  next: string;
  apply: boolean;
  type: 'text' | 'number' | 'date';
  attribute?: boolean;
  attributeKey?: string;
  /**
   * Marker so we can find the value row later when computing
   * value_history / current_value / current_value_source.
   */
  isPriceRow?: 'acquired_price' | 'current_value';
}

const KIND_TITLE: Record<AttachmentKind, string> = {
  receipt: 'Apply receipt details',
  appraisal: 'Apply appraisal details',
  manual: 'Apply manual details',
  other: 'Apply document details',
};

const KIND_BLURB: Record<AttachmentKind, string> = {
  receipt: 'We extracted the following from the receipt. Pick which ones to apply, then confirm.',
  appraisal: 'We extracted the following from the appraisal. Pick which ones to apply, then confirm.',
  manual: 'We extracted the following from the manual. Pick which ones to apply, then confirm.',
  other: 'We extracted the following from the document. Pick which ones to apply, then confirm.',
};

const KIND_EMPTY: Record<AttachmentKind, string> = {
  receipt: "The model couldn't pull anything useful out of this receipt. You can still keep the file as a reference attachment.",
  appraisal: "The model couldn't pull any structured fields out of this appraisal. You can still keep the file as a reference attachment.",
  manual: "The model couldn't pull anything useful out of this manual. You can still keep the file as a reference attachment.",
  other: "The model couldn't extract anything structured. You can still keep the file as a reference attachment.",
};

/**
 * "Full actions with confirmation" UI for any document extraction.
 *
 * Field mapping varies by kind:
 *  - receipt   → total → acquired_price, vendor → acquired_from, purchase_date → acquired_date
 *  - appraisal → appraised_value → current_value, appraiser → notes, appraisal_date → current_value_updated_at
 *  - manual    → manufacturer / model / serial_number / warranty_until / notes only (no price)
 *  - other     → both: receipt-style if total exists, appraisal-style if appraised_value exists
 */
export function DocumentApplyDialog(props: Props) {
  const { kind, category, current, extraction, onClose } = props;
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logToHistory, setLogToHistory] = useState(true);

  const initialRows = useMemo<Row[]>(() => {
    const r: Row[] = [];
    const push = (
      key: string,
      label: string,
      currentVal: Row['current'],
      nextVal: string | number | null,
      type: Row['type'],
      opts?: { attribute?: boolean; attributeKey?: string; isPriceRow?: Row['isPriceRow'] }
    ) => {
      const next = nextVal == null ? '' : String(nextVal);
      if (!next) return;
      const isEmpty = currentVal == null || currentVal === '';
      r.push({
        key,
        label,
        current: currentVal,
        next,
        apply: isEmpty || String(currentVal) !== next,
        type,
        attribute: opts?.attribute,
        attributeKey: opts?.attributeKey,
        isPriceRow: opts?.isPriceRow,
      });
    };

    // ---- Identification rows are universal ----
    push('manufacturer', 'Manufacturer', current.manufacturer, extraction.manufacturer, 'text');
    push('model', 'Model', current.model, extraction.model, 'text');
    push('serial_number', 'Serial number', current.serial_number, extraction.serial_number, 'text');

    // ---- Receipt-style rows ----
    if (kind === 'receipt' || (kind === 'other' && (extraction.total || extraction.vendor))) {
      push('acquired_date', 'Acquired date', current.acquired_date, extraction.purchase_date, 'date');
      push('acquired_from', 'Acquired from (vendor)', current.acquired_from, extraction.vendor, 'text');
      push('acquired_price', 'Acquired price', current.acquired_price, extraction.total, 'number', {
        isPriceRow: 'acquired_price',
      });
    }

    // ---- Appraisal-style rows ----
    if (kind === 'appraisal' || (kind === 'other' && extraction.appraised_value)) {
      push('current_value', 'Current value (appraised)', current.current_value, extraction.appraised_value, 'number', {
        isPriceRow: 'current_value',
      });
      // appraiser is composed into notes below; we don't surface a column row for it
    }

    // ---- Common art / decorative-art appraisal extras ----
    if (extraction.condition) {
      push('condition', 'Condition', current.condition ?? null, extraction.condition, 'text');
    }
    if (
      extraction.description &&
      (!current.description || extraction.description.length > (current.description?.length ?? 0))
    ) {
      push('description', 'Description', current.description ?? null, extraction.description, 'text');
    }

    // ---- Category attributes (only push when the category has the field) ----
    const isArtish = category === 'art' || category === 'decorative_arts' || category === 'ethnographic_art';
    if (extraction.artist && isArtish) {
      push('_artist', 'Artist', null, extraction.artist, 'text', { attribute: true, attributeKey: 'artist' });
    }
    if (extraction.medium && (category === 'art' || category === 'decorative_arts')) {
      push('_medium', 'Medium', null, extraction.medium, 'text', { attribute: true, attributeKey: 'medium' });
    }
    if (extraction.dimensions) {
      const attrKey = isArtish || category === 'figurines' ? 'dimensions' : null;
      if (attrKey) {
        push('_dimensions', 'Dimensions', null, extraction.dimensions, 'text', {
          attribute: true,
          attributeKey: attrKey,
        });
      }
    }
    if (extraction.year_created && isArtish) {
      push('_year_created', 'Year', null, extraction.year_created, 'text', {
        attribute: true,
        attributeKey: 'year_created',
      });
    }
    if (extraction.provenance && isArtish) {
      push('_provenance', 'Provenance', null, extraction.provenance, 'text', {
        attribute: true,
        attributeKey: 'provenance',
      });
    }
    if (extraction.warranty_until && category === 'electronics') {
      push('_warranty_until', 'Warranty until', null, extraction.warranty_until, 'date', {
        attribute: true,
        attributeKey: 'warranty_until',
      });
    }

    // ---- Notes: append rather than overwrite ----
    const noteParts: string[] = [];
    if (kind === 'receipt' && extraction.notes) {
      noteParts.push(`From receipt: ${extraction.notes}`);
    } else if (kind === 'appraisal') {
      const appr = extraction.appraiser
        ? `Appraised by ${extraction.appraiser}${extraction.appraisal_date ? ` on ${extraction.appraisal_date}` : ''}.`
        : null;
      if (appr) noteParts.push(appr);
      if (extraction.notes) noteParts.push(extraction.notes);
    } else if (kind === 'manual' && extraction.notes) {
      noteParts.push(`From manual: ${extraction.notes}`);
    } else if (kind === 'other' && extraction.notes) {
      noteParts.push(extraction.notes);
    }
    if (noteParts.length > 0) {
      const addition = noteParts.join(' ');
      const merged = current.notes ? `${current.notes}\n\n${addition}` : addition;
      push('notes', 'Notes (appended)', current.notes, merged, 'text');
    }

    return r;
  }, [current, extraction, kind, category]);

  const [rows, setRows] = useState<Row[]>(initialRows);
  useEffect(() => setRows(initialRows), [initialRows]);

  const nothingToApply = rows.length === 0;

  /**
   * Build the row-level updates plus any synthetic value/history bookkeeping
   * a price row triggers. Reused by both apply paths (PATCH vs callback).
   */
  function buildResult(): DocumentApplyResult {
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
        fields[r.key] = val;
      }
    }

    let valueHistoryEntry: DocumentApplyResult['valueHistoryEntry'] = null;

    const acquiredPriceRow = rows.find((r) => r.isPriceRow === 'acquired_price' && r.apply);
    const currentValueRow = rows.find((r) => r.isPriceRow === 'current_value' && r.apply);

    if (kind === 'receipt' && acquiredPriceRow) {
      const v = Number(acquiredPriceRow.next);
      if (Number.isFinite(v)) {
        // A receipt is a stronger value source than a manual estimate, so
        // promote it to current_value too.
        fields.current_value = v;
        fields.current_value_source = 'receipt';
        fields.current_value_updated_at = new Date().toISOString();
        if (logToHistory && extraction.purchase_date) {
          valueHistoryEntry = {
            value: v,
            source: 'receipt',
            dated_on: extraction.purchase_date,
            notes: extraction.vendor ? `Purchased from ${extraction.vendor}` : 'Receipt purchase',
          };
        }
      }
    }

    if ((kind === 'appraisal' || kind === 'other') && currentValueRow) {
      const v = Number(currentValueRow.next);
      if (Number.isFinite(v)) {
        fields.current_value = v;
        fields.current_value_source = 'appraisal';
        // Prefer the appraisal date; fall back to "now" so the field stays sane.
        fields.current_value_updated_at = extraction.appraisal_date
          ? new Date(extraction.appraisal_date).toISOString()
          : new Date().toISOString();
        if (logToHistory && extraction.appraisal_date) {
          valueHistoryEntry = {
            value: v,
            source: 'appraisal',
            dated_on: extraction.appraisal_date,
            notes: extraction.appraiser ? `Appraised by ${extraction.appraiser}` : 'Appraisal',
          };
        }
      }
    }

    return { fields, attributes, valueHistoryEntry };
  }

  async function handleApply() {
    setError(null);
    setBusy(true);
    try {
      const result = buildResult();

      // ----- Callback mode: hand the updates back to the caller -----
      if (props.mode === 'callback') {
        props.onApply(result);
        onClose();
        return;
      }

      // ----- Patch mode: write directly to the existing item -----
      const patchBody: Record<string, unknown> = { ...result.fields };
      if (Object.keys(result.attributes).length > 0) patchBody.attributes = result.attributes;

      if (Object.keys(result.fields).length > 0 || Object.keys(result.attributes).length > 0) {
        const res = await fetch(`/api/items/${props.itemId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patchBody),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? 'Update failed');
      }

      if (result.valueHistoryEntry) {
        await fetch('/api/value-history', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ item_id: props.itemId, ...result.valueHistoryEntry }),
        }).catch(() => {
          // Non-fatal: the field write already succeeded.
        });
      }

      props.onApplied?.();
      router.refresh();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to apply');
    } finally {
      setBusy(false);
    }
  }

  const conf = extraction.confidence != null ? `${Math.round(extraction.confidence * 100)}%` : null;

  // Show the "log to history" toggle only when there's an applicable price row.
  const hasApplicablePriceRow = rows.some(
    (r) => r.apply && (r.isPriceRow === 'acquired_price' || r.isPriceRow === 'current_value')
  );
  const historyDateAvailable =
    (kind === 'receipt' && !!extraction.purchase_date) ||
    ((kind === 'appraisal' || kind === 'other') && !!extraction.appraisal_date);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="card w-full max-w-2xl max-h-[90vh] overflow-y-auto p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">{KIND_TITLE[kind]}</h2>
            <p className="text-xs text-brand-300 mt-1">
              {KIND_BLURB[kind]}
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
            {KIND_EMPTY[kind]}
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
                  {row.type === 'text' && (row.key === 'notes' || row.key === 'description' || row.next.length > 60) ? (
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

            {hasApplicablePriceRow && historyDateAvailable && (
              <label className="flex items-center gap-2 text-xs text-brand-300">
                <input
                  type="checkbox"
                  checked={logToHistory}
                  onChange={(e) => setLogToHistory(e.target.checked)}
                />
                <span>
                  {kind === 'appraisal'
                    ? 'Also log this value as an appraisal entry in value history.'
                    : 'Also log this price as a value-history entry on the document date.'}
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
              {busy ? 'Applying...' : props.mode === 'callback' ? 'Use these values' : 'Apply to item'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
