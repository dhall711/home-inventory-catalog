# Backlog

Curated list of features deferred from active development. Each entry has a
rough effort estimate and a short rationale so we can pick them up without
re-doing the analysis. New ideas welcome — keep them grouped by theme and
sized so we can drop them into a sprint without further design work.

---

## Borrowed from competitors (Itemtopia analysis, 2026-04)

Source: <https://www.itemtopia.com/media-assets>

### High-value (do first when we revisit operational features)

- **Barcode (UPC/EAN) scanning — focus: books & media first.**
  Use device camera + a JS barcode lib (e.g. `@zxing/browser`) to read ISBN /
  UPC / EAN. Lookup against:
  - Books: Open Library API (`https://openlibrary.org/api/books?bibkeys=ISBN:...`)
    or Google Books — returns title, authors, cover, publisher, year.
  - Media (CDs/DVDs/Blu-ray): MusicBrainz / Discogs / TheMovieDB.
  - Retail electronics: Go-UPC or UPCitemDB.
  Add a "Scan barcode" tile next to "Take photo" in the QuickConfirm flow.
  Falls back to AI vision when no UPC match. Estimated effort: ~1 day for
  books-only MVP, +0.5 day per additional source.

- **QR code labels (per item AND per box).**
  Generate a QR per item linking to its public share URL; generate a QR per
  "container" (a `kind: 'box'` collection) linking to its contents
  checklist. `/api/qr/[id]` returns a PNG; `/labels/print` page lays them
  out 30/sheet on Avery 5160. Killer feature for storage units, attics,
  and moves. Estimated effort: ~1.5 days. Depends on share URLs below.

- **Public share-by-link.**
  Signed, expiring read-only URL per item or per collection. No login.
  Renders photos + attributes + receipt thumbnails. Replaces zipping
  PDFs to send to insurance adjusters or buyers. New `share_links` table
  (`item_id` or `collection_id`, `expires_at`, `slug`, `include_receipts`)
  + `/s/[slug]` public route. Estimated effort: ~1 day.

- **Reminders & to-dos engine.**
  Generic `reminders` table (`item_id`, `due_at`, `recur`, `note`,
  `completed_at`). Surfaces warranty expiry, "service the HVAC,"
  "rotate the wine," "test smoke detector." Dashboard widget + sidebar
  "Due soon" badge. Big perceived-value lift for almost no model work.
  Estimated effort: ~1 day for in-app; +1 day for daily email cron.

- **Warranty tracking + expiration alerts.**
  Promote `warranty_until` from electronics-only attribute to a
  first-class column on `items`. Daily Vercel Cron + Supabase Edge
  Function checks `warranty_expires_at <= now() + 30 days` and creates
  a reminder (or emails). Estimated effort: ~1 day if reminders engine
  is already in place.

### Medium-value (borrow conditionally)

- **Maintenance / service log per item.** Distinct from receipts — track
  vendor, what was done, cost. Generalize attachments into an "events"
  table. Worth doing only if real users ask for it. ~1 day.

- **Surface nested locations in the UI.** Schema already supports
  `parent_id`. Render the locations page as a tree; show "Garage › Top
  shelf" in the location picker. ~0.5 day.

- **Loaned-out / "who has it" status.** Add `loaned_to_name` +
  `loaned_until` (or new `'loaned'` value on `status`). Sidebar chip
  "Out on loan." ~0.5 day.

- **CSV expense export grouped by category/vendor/year.** Useful for
  tax season. Reuses report infrastructure. ~0.5 day.

- **Linked items / kits.** Parent item that contains child items
  (camera body + lens + flash + bag). Useful for things you'd insure
  or sell as a unit. Add `parent_item_id`. ~1 day.

### Skip / defer

- **Pet records.** Out of scope for the value-asset thesis.
- **Linked services with recurring billing.** Inches toward property
  management software — wrong product.
- **Offline-first PWA with conflict resolution.** Real offline sync
  against Supabase is a 2–4 week project. Defer until product-market
  fit. Instead make sure photo upload degrades gracefully on flaky
  connections (queue + retry).
- **11-language i18n.** Premature internationalization is a tax on
  every future feature. Revisit after PMF.

---

## From the original 7-item roadmap (2026-04)

Status of the seven roadmap items as of this writing:

1. **Multi-tenant auth hardening** — household isolation works via RLS;
   long-term shape is consumer SaaS (one family per account, many
   households per family eventually). Not started.
2. **Reset script + simpler setup** — DONE (Phase 1).
3. **Video walkthrough capture** — Not started. Big project: needs a
   pipeline that samples frames, runs them through Claude vision in
   batches, dedupes detections across frames. Probably 1–2 weeks.
4. **More filtering & sidebar nav** — DONE (Phase 1).
5. **AI chat interface** — IN PROGRESS (next sprint).
6. **Competitive analysis (other apps)** — Itemtopia analyzed above;
   re-do periodically (Sortly, Encircle, NestEgg, Magic Home Inventory).
7. **Commercial-grade asset management features** — partially absorbed
   into the Itemtopia borrows above (reminders, warranty, share URLs,
   maintenance log). Heavier features (chain-of-custody, depreciation
   schedules, multi-site asset transfer) remain deferred.

---

## Free-form ideas

- **Receipt OCR.** Run Claude vision against uploaded receipt
  attachments to auto-fill `acquired_price` / `acquired_date` / vendor.
  Cheap addition once we add an "import attachment" workflow. ~0.5 day.
- **Multi-currency.** `currency` already on household; per-item
  override + display conversion would let collectors with international
  purchases track origin currency. ~1 day.
- **Bulk import from CSV / Apple Numbers spreadsheet.** Many people
  already have a spreadsheet. ~1 day.
- **Photo dedup.** Detect duplicate uploads via perceptual hash
  before they hit storage. ~0.5 day.
