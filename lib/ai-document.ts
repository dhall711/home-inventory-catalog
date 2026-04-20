/**
 * AI document-extraction prompts and shared types.
 *
 * One unified extraction shape is used for every kind of attachment we
 * scan with Claude (receipt, appraisal, manual, other). The prompt is
 * tailored per kind, but the response always lands in a `DocumentExtraction`
 * so the same confirmation UI (`DocumentApplyDialog`) can render it.
 */
import type { AttachmentKind } from '@/lib/types';

export interface ReceiptLineItem {
  description: string;
  quantity?: number | null;
  unit_price?: number | null;
  amount?: number | null;
}

/**
 * Superset of every field any of our document types may surface. Each
 * field is optional / nullable - the model is told to omit anything it
 * can't confidently read, and the normalizer below coerces empty strings
 * and "unknown" placeholders to null.
 */
export interface DocumentExtraction {
  // ---- Identification (any kind) ----
  manufacturer: string | null;
  model: string | null;
  serial_number: string | null;
  /** Free-form notes / commentary from the doc that didn't map elsewhere. */
  notes: string | null;
  /** 0..1 self-rated by the model. */
  confidence: number | null;

  // ---- Receipt-specific ----
  vendor: string | null;
  vendor_address: string | null;
  purchase_date: string | null;        // YYYY-MM-DD
  currency: string | null;             // ISO-4217
  subtotal: number | null;
  tax: number | null;
  total: number | null;
  payment_method: string | null;
  order_number: string | null;
  warranty_until: string | null;       // YYYY-MM-DD
  line_items: ReceiptLineItem[];

  // ---- Appraisal-specific ----
  appraiser: string | null;
  appraisal_date: string | null;       // YYYY-MM-DD
  /** The headline insurance/replacement value on the document. */
  appraised_value: number | null;
  /** Condition wording from the appraisal ("Excellent", "Good - minor wear", ...). */
  condition: string | null;
  /** Detailed description if the appraisal expands on the item. */
  description: string | null;
  /** Common art / decorative-art fields appraisals frequently include. */
  artist: string | null;
  medium: string | null;
  dimensions: string | null;
  year_created: string | null;
  provenance: string | null;
}

export interface DocumentItemContext {
  name?: string | null;
  manufacturer?: string | null;
  model?: string | null;
  category?: string | null;
}

const SHARED_RULES = `Return ONLY a JSON object matching the requested shape. Use null (not "" and not "unknown") for any field you cannot read. Numeric fields must be plain numbers (no currency symbol, no thousands separators). Dates must be ISO YYYY-MM-DD; if a date is ambiguous, prefer null over a guess.`;

const FULL_SHAPE = `{
  "manufacturer": string or null,
  "model": string or null,
  "serial_number": string or null,
  "notes": string or null,
  "confidence": 0.0-1.0,

  "vendor": string or null,
  "vendor_address": string or null,
  "purchase_date": "YYYY-MM-DD or null",
  "currency": "ISO-4217 (USD, EUR, ...) or null",
  "subtotal": number or null,
  "tax": number or null,
  "total": number or null,
  "payment_method": string or null,
  "order_number": string or null,
  "warranty_until": "YYYY-MM-DD or null",
  "line_items": [
    { "description": string, "quantity": number or null, "unit_price": number or null, "amount": number or null }
  ],

  "appraiser": string or null,
  "appraisal_date": "YYYY-MM-DD or null",
  "appraised_value": number or null,
  "condition": string or null,
  "description": string or null,
  "artist": string or null,
  "medium": string or null,
  "dimensions": string or null,
  "year_created": "YYYY or null",
  "provenance": string or null
}`;

function ctxLine(ctx: DocumentItemContext): string {
  const parts = [
    ctx.name && `name: "${ctx.name}"`,
    ctx.manufacturer && `manufacturer: "${ctx.manufacturer}"`,
    ctx.model && `model: "${ctx.model}"`,
    ctx.category && `category: "${ctx.category}"`,
  ].filter(Boolean);
  return parts.join(', ');
}

function receiptPrompt(ctx: DocumentItemContext): string {
  const c = ctxLine(ctx);
  const itemHint = c
    ? `\n\nThe receipt is being attached to this specific item: ${c}.\nIf the receipt has multiple line items, pick the one that best matches this item and use its line price as "total" (instead of the receipt grand total). Ignore unrelated lines. Leave appraisal-only fields (appraiser, appraised_value, artist, medium, ...) as null.`
    : `\n\nLeave appraisal-only fields (appraiser, appraised_value, artist, medium, ...) as null.`;
  return `You are extracting structured data from a sales receipt or invoice for a home inventory app. The user uploaded this receipt to back up the acquisition details of an item they own.

${SHARED_RULES}

${FULL_SHAPE}

Receipt-specific guidance:
- "vendor" = store/seller name as printed.
- "total" = price paid for THIS item (line-item price if context is provided, else grand total).
- "warranty_until" only if a warranty/returns expiry date is printed.
- "manufacturer/model/serial_number" only if explicitly on the receipt; do not invent.
- If the receipt is in another language, translate vendor/notes to English but keep proper nouns intact.${itemHint}`;
}

function appraisalPrompt(ctx: DocumentItemContext): string {
  const c = ctxLine(ctx);
  const itemHint = c
    ? `\n\nThe appraisal is being attached to this specific item: ${c}. If the appraisal covers multiple items, focus on the entry that best matches this item.`
    : '';
  return `You are extracting structured data from an appraisal report (jewelry, art, antique, watch, decorative arts, etc.) for a home inventory app. The user uploaded this appraisal to back up the insured/replacement value of an item they own.

${SHARED_RULES}

${FULL_SHAPE}

Appraisal-specific guidance:
- "appraiser" = name of the person or firm signing the appraisal.
- "appraisal_date" = date the appraisal was performed (NOT the purchase date).
- "appraised_value" = the headline insurance / replacement value (in the appraisal's currency). Use the highest stated number when both wholesale and retail-replacement are listed (insurers care about replacement).
- "condition" = the appraiser's condition wording (e.g. "Excellent", "Very good, minor surface scratches").
- "description" = the appraiser's detailed item description if it adds detail beyond what the user already has.
- "artist", "medium", "dimensions", "year_created", "provenance" = fill any of these that are explicitly stated. These are common on art and decorative-art appraisals.
- Receipt-only fields (vendor, total, payment_method, order_number, line_items) should be null unless the appraisal also documents a purchase (rare).
- "warranty_until" should be null - appraisals don't carry warranties.${itemHint}`;
}

function manualPrompt(ctx: DocumentItemContext): string {
  const c = ctxLine(ctx);
  const itemHint = c
    ? `\n\nThe manual is for this item: ${c}.`
    : '';
  return `You are extracting structured data from an owner's manual, user guide, spec sheet, warranty card, or product datasheet for a home inventory app.

${SHARED_RULES}

${FULL_SHAPE}

Manual-specific guidance:
- "manufacturer" = brand/maker on the cover or title page.
- "model" = model name and/or model number printed on the manual or spec sheet.
- "serial_number" = ONLY if the user has handwritten the unit's serial number on the manual or warranty registration card. Generic example serials in the manual body do not count - return null.
- "warranty_until" only if a clear expiry date is recorded (e.g. on a warranty registration card).
- "year_created" = year of manufacture if stated.
- "notes" = a short sentence summarizing key specs that don't map elsewhere (e.g. "Battery: 18650, USB-C, IP67").
- "condition" should be null (manuals don't describe condition).
- Receipt fields (vendor, total, ...) and appraisal fields (appraiser, appraised_value, ...) should all be null.${itemHint}`;
}

function otherPrompt(ctx: DocumentItemContext): string {
  const c = ctxLine(ctx);
  const itemHint = c
    ? `\n\nThe document is being attached to this item: ${c}.`
    : '';
  return `You are extracting structured data from a household-inventory document. The user did not categorise it specifically (it could be a registration card, certificate of authenticity, insurance schedule, provenance letter, ownership transfer, customs document, or any other paperwork that backs up an item).

${SHARED_RULES}

${FULL_SHAPE}

General guidance:
- Fill any field that is clearly stated. Leave anything you can't confidently read as null.
- If you see a price, decide whether it's a purchase price (use "total" + "vendor" + "purchase_date") or a valuation (use "appraised_value" + "appraiser" + "appraisal_date"). If unclear, prefer "appraised_value" because that's how insurers treat unsourced valuations.
- "notes" should capture the document's purpose in one sentence (e.g. "Certificate of authenticity from House of X.").${itemHint}`;
}

export function buildDocumentPrompt(kind: AttachmentKind, ctx: DocumentItemContext): string {
  switch (kind) {
    case 'receipt':   return receiptPrompt(ctx);
    case 'appraisal': return appraisalPrompt(ctx);
    case 'manual':    return manualPrompt(ctx);
    case 'other':     return otherPrompt(ctx);
  }
}

/**
 * Strip empty strings / common "unknown" placeholders the model may slip
 * in despite the prompt, clamp dates to YYYY-MM-DD shape, and ensure
 * every field on the type is present (even when the model omitted it).
 */
export function normalizeDocument(raw: Record<string, unknown>): DocumentExtraction {
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
    // identification
    manufacturer: txt(raw.manufacturer),
    model: txt(raw.model),
    serial_number: txt(raw.serial_number),
    notes: txt(raw.notes),
    confidence: num(raw.confidence),
    // receipt
    vendor: txt(raw.vendor),
    vendor_address: txt(raw.vendor_address),
    purchase_date: date(raw.purchase_date),
    currency: txt(raw.currency),
    subtotal: num(raw.subtotal),
    tax: num(raw.tax),
    total: num(raw.total),
    payment_method: txt(raw.payment_method),
    order_number: txt(raw.order_number),
    warranty_until: date(raw.warranty_until),
    line_items,
    // appraisal
    appraiser: txt(raw.appraiser),
    appraisal_date: date(raw.appraisal_date),
    appraised_value: num(raw.appraised_value),
    condition: txt(raw.condition),
    description: txt(raw.description),
    artist: txt(raw.artist),
    medium: txt(raw.medium),
    dimensions: txt(raw.dimensions),
    year_created: txt(raw.year_created),
    provenance: txt(raw.provenance),
  };
}

/** Returns true if the extraction has at least one user-visible field set. */
export function hasAnyExtraction(e: DocumentExtraction): boolean {
  return Boolean(
    e.manufacturer ||
      e.model ||
      e.serial_number ||
      e.notes ||
      e.vendor ||
      e.purchase_date ||
      e.total ||
      e.warranty_until ||
      e.payment_method ||
      e.order_number ||
      e.appraiser ||
      e.appraisal_date ||
      e.appraised_value ||
      e.condition ||
      e.description ||
      e.artist ||
      e.medium ||
      e.dimensions ||
      e.year_created ||
      e.provenance ||
      e.line_items.length > 0
  );
}
