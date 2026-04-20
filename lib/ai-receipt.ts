/**
 * AI receipt-extraction prompt and shared types.
 *
 * Used by /api/extract-receipt to pull structured data out of a receipt
 * (image or PDF) so the user can one-click apply it onto an item.
 */

export interface ReceiptLineItem {
  description: string;
  quantity?: number | null;
  unit_price?: number | null;
  amount?: number | null;
}

/**
 * Shape returned by Claude. Every field is optional - the model returns
 * what it can read off the receipt and omits the rest. The /api route
 * normalizes empty strings to null before returning.
 */
export interface ReceiptExtraction {
  vendor: string | null;
  vendor_address: string | null;
  purchase_date: string | null;       // YYYY-MM-DD
  currency: string | null;            // ISO-4217 (USD, EUR, ...)
  subtotal: number | null;
  tax: number | null;
  total: number | null;
  payment_method: string | null;
  order_number: string | null;
  // Per-item fields (these match items.* columns 1:1)
  manufacturer: string | null;
  model: string | null;
  serial_number: string | null;
  warranty_until: string | null;       // YYYY-MM-DD
  // Anything that doesn't fit the typed schema goes here so we don't lose it.
  notes: string | null;
  line_items: ReceiptLineItem[];
  confidence: number | null;           // 0..1, model self-rated
}

export interface ReceiptItemContext {
  name?: string | null;
  manufacturer?: string | null;
  model?: string | null;
  category?: string | null;
}

/**
 * Build the extraction prompt. Including a small amount of context about
 * the item (name/manufacturer/model) helps the model when a receipt has
 * many line items - it can pick the right one and ignore unrelated rows.
 */
export function buildReceiptPrompt(ctx: ReceiptItemContext): string {
  const ctxLine = [
    ctx.name && `name: "${ctx.name}"`,
    ctx.manufacturer && `manufacturer: "${ctx.manufacturer}"`,
    ctx.model && `model: "${ctx.model}"`,
    ctx.category && `category: "${ctx.category}"`,
  ]
    .filter(Boolean)
    .join(', ');

  const itemHint = ctxLine
    ? `\n\nThe receipt is being attached to this specific item: ${ctxLine}.\nIf the receipt has multiple line items, pick the one that best matches this item and use its line price as "total" (instead of the receipt grand total). Ignore unrelated lines.`
    : '';

  return `You are extracting structured data from a sales receipt or invoice for a home inventory app. The user uploaded this receipt to back up the acquisition details of an item they own.

Return ONLY a JSON object matching this exact shape. Use null (not "" and not "unknown") for any field you can't read off the receipt. Numeric fields must be plain numbers (no currency symbol, no thousands separators).

{
  "vendor": "Store/seller name as printed",
  "vendor_address": "Single-line address if visible, else null",
  "purchase_date": "YYYY-MM-DD or null",
  "currency": "ISO-4217 code inferred from symbol (USD, EUR, GBP, JPY, ...) or null",
  "subtotal": number or null,
  "tax": number or null,
  "total": number or null,
  "payment_method": "e.g. Visa **1234, Cash, PayPal, or null",
  "order_number": "Order/invoice/receipt number if printed, else null",
  "manufacturer": "Brand/maker for the item, only if explicitly on the receipt, else null",
  "model": "Model name/number for the item, only if explicitly on the receipt, else null",
  "serial_number": "Serial number for the item if printed (often labelled S/N or Serial), else null",
  "warranty_until": "YYYY-MM-DD if a warranty/returns expiry date is visible, else null",
  "notes": "1-2 short sentences capturing anything else useful (e.g. 'Includes 2yr extended warranty'), else null",
  "line_items": [
    { "description": "row text", "quantity": number or null, "unit_price": number or null, "amount": number or null }
  ],
  "confidence": 0.0-1.0
}

Rules:
- Dates must be ISO YYYY-MM-DD. Convert ambiguous formats (e.g. 03/04/2024) using receipt locale clues; if ambiguous, prefer YYYY-MM-DD using vendor country if known, otherwise return null.
- Don't invent serial/model numbers - only return them if clearly printed.
- If the receipt is in another language, translate vendor/notes to English but keep proper nouns intact.${itemHint}`;
}

/**
 * Strip empty strings / common "unknown" placeholders the model may slip in
 * despite the prompt, and clamp dates to YYYY-MM-DD shape.
 */
export function normalizeReceipt(raw: Record<string, unknown>): ReceiptExtraction {
  const txt = (v: unknown): string | null => {
    if (typeof v !== 'string') return v == null ? null : String(v);
    const t = v.trim();
    if (!t) return null;
    if (/^(unknown|n\/a|none|null|undefined|-)$/i.test(t)) return null;
    return t;
  };
  const num = (v: unknown): number | null => {
    if (v == null || v === '') return null;
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    const cleaned = String(v).replace(/[^0-9.\-]/g, '');
    if (!cleaned) return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  };
  const date = (v: unknown): string | null => {
    const t = txt(v);
    if (!t) return null;
    return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : null;
  };

  const lineItemsRaw = Array.isArray(raw.line_items) ? raw.line_items : [];
  const line_items: ReceiptLineItem[] = lineItemsRaw
    .map((row): ReceiptLineItem | null => {
      const r = row as Record<string, unknown>;
      const description = txt(r.description);
      if (!description) return null;
      return {
        description,
        quantity: num(r.quantity),
        unit_price: num(r.unit_price),
        amount: num(r.amount),
      };
    })
    .filter((r): r is ReceiptLineItem => r !== null);

  return {
    vendor: txt(raw.vendor),
    vendor_address: txt(raw.vendor_address),
    purchase_date: date(raw.purchase_date),
    currency: txt(raw.currency),
    subtotal: num(raw.subtotal),
    tax: num(raw.tax),
    total: num(raw.total),
    payment_method: txt(raw.payment_method),
    order_number: txt(raw.order_number),
    manufacturer: txt(raw.manufacturer),
    model: txt(raw.model),
    serial_number: txt(raw.serial_number),
    warranty_until: date(raw.warranty_until),
    notes: txt(raw.notes),
    line_items,
    confidence: num(raw.confidence),
  };
}
