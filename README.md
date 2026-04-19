# Home Inventory Catalog

A multi-user (household) home inventory web app. Take photos of objects of value and let Claude vision auto-catalog them with category-aware fields, AI-assisted valuation, value history, attachments (receipts/appraisals), and PDF + CSV insurance reports.

Modeled on the wine catalog framework but with a real Postgres backend (Supabase), per-category typed schemas, and both single-item and room/shelf batch capture.

## Stack

- Next.js 15 (App Router) + TypeScript + Tailwind
- Supabase: Postgres, Auth (magic link), Storage, RLS
- Anthropic Claude (vision) for item extraction & valuation
- `@react-pdf/renderer` for PDF schedules
- `sharp` for server-side thumbnails
- `recharts` for value/category charts

## Features

- Household-scoped data with email magic-link auth and invitable members
- Items list with server-side filtering (category, location, collection, tag, value range, status, search) and grid/list views
- Detailed per-item page with photo gallery, value-history chart, attachments, tags
- Single-item AI capture: photo &rarr; AI extracts category, name, manufacturer, model, condition, suggested value &rarr; you confirm
- Batch AI capture: shoot a shelf/room/drawer &rarr; AI returns each detected item with a bounding box overlay &rarr; review queue to confirm/edit/reject
- AI value re-estimation per item, all writes tracked in `value_history`
- Insurance reports: filterable PDF schedule (cover page, grouped by category, subtotals) + CSV export, saved to Supabase Storage with 7-day signed URLs
- Hierarchical locations (House &gt; Room &gt; Shelf), collections, free-form tags
- Dashboard with totals, value-by-category bar chart, recent additions
- PWA manifest + mobile camera capture (`<input type="file" capture="environment">`)

## Setup

### 1. Create a Supabase project

- Go to https://supabase.com/dashboard, create a project
- In the SQL editor, paste and run [supabase/migrations/0001_initial_schema.sql](supabase/migrations/0001_initial_schema.sql)
- Then run [supabase/migrations/0002_extended_collections.sql](supabase/migrations/0002_extended_collections.sql) to add the collection-oriented categories (figurines, ethnographic art, decorative arts, pipes, musical instruments, coins, stamps, firearms, wine & spirits), the `items.custom_attributes` JSONB catch-all, and the richer `collections` (default category, cover photo, notes)
- This creates all tables, RLS policies, and storage buckets (`item-photos`, `item-attachments`, `reports`)
- In Auth &rarr; URL Configuration, add `http://localhost:3000` and your Vercel URL to "Redirect URLs"

### 2. Local development

```bash
cd home-inventory-catalog
cp .env.example .env.local
# Fill in:
#   NEXT_PUBLIC_SUPABASE_URL
#   NEXT_PUBLIC_SUPABASE_ANON_KEY
#   SUPABASE_SERVICE_ROLE_KEY  (server only - settings > API)
#   ANTHROPIC_API_KEY
#   NEXT_PUBLIC_SITE_URL=http://localhost:3000

npm install
npm run dev
```

Open http://localhost:3000 and sign in with your email. A household will be created automatically on first sign-in.

### 3. Invite household members (optional)

- Visit `/settings`
- Click "Create invite" with their email and role
- When that person signs in with the same email address, they will be auto-added to your household

## Deployment to Vercel

This repo is laid out as a top-level Next.js project (no subdirectory), so Vercel auto-detects it.

1. Push this repo to GitHub (e.g. `github.com/<you>/home-inventory-catalog`)
2. On [vercel.com/new](https://vercel.com/new) &rarr; "Import Git Repository" &rarr; pick `home-inventory-catalog`
3. Framework: **Next.js** (auto-detected). Leave the root directory as the repo root.
4. Under "Environment Variables", add (matching your `.env.local`):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `ANTHROPIC_API_KEY`
   - `NEXT_PUBLIC_SITE_URL` &rarr; the Vercel URL (e.g. `https://home-inventory-catalog.vercel.app`)
5. Deploy. After the first deploy, copy the production URL.
6. In **Supabase &rarr; Authentication &rarr; URL Configuration**, add:
   - Site URL: `https://<your-app>.vercel.app`
   - Redirect URLs: `https://<your-app>.vercel.app/auth/callback`
7. Optional: from the Vercel CLI you can manage future deploys without the dashboard:

   ```bash
   npm i -g vercel
   vercel login
   vercel link        # one-time, links the local folder to the Vercel project
   vercel --prod      # deploy
   vercel env pull    # sync prod env vars into .env.local
   ```

## Architecture overview

```
app/
  page.tsx                  Dashboard
  login/                    Magic-link auth
  auth/callback/            Supabase OAuth code exchange + auto household creation
  items/                    List, detail, edit, new (with AI prefill)
  batch/                    Shelf/room photo upload + review queue
  locations|collections|tags|reports|settings
  api/
    items/                  CRUD
    upload/photo|attachment Server-side multipart -> Supabase Storage (with sharp thumbnails)
    analyze-item            Claude vision -> single item structured output
    analyze-batch           Claude vision -> array of detections with bounding boxes
    estimate-value          Claude vision + item details -> appraised value, writes value_history
    reports                 Renders PDF + CSV, uploads to storage, signs URLs
    attachments/[id]/url    Signed URL for private attachments
    auth/signout
components/                 Nav, FilterSidebar, ItemCard/Form, ValueHistoryChart, AttachmentsPanel, etc.
lib/
  supabase/                 Browser, server (cookies), service-role, middleware
  household.ts              ensureHousehold, requireHousehold
  items.ts                  listItems with server-side filters/pagination
  ai.ts                     Anthropic helpers
  pdfReport.tsx             @react-pdf/renderer schedule
  csv.ts                    CSV writer
  storage.ts                Bucket constants + path builders
  types.ts                  Item, CategorySlug, CATEGORY_ATTRIBUTES, etc.
supabase/migrations/0001_initial_schema.sql
middleware.ts               Auth gate redirecting unauthenticated users to /login
```

## Data model

- `households` + `household_members` + `household_invites` (multi-user)
- `items` (core fields, FTS column maintained by trigger)
- `item_attributes_<category>` (1-to-1 typed extension per category: art, electronics, jewelry, furniture, watches, collectibles)
- `item_photos`, `item_attachments`, `value_history`
- `locations` (hierarchical), `collections`, `tags` + `item_tags`
- `batch_uploads` (one source photo, many drafted items in `review` status)
- `reports` (saved snapshots with PDF/CSV signed URLs)

All RLS policies are scoped via `public.user_household_ids()` so users only see their own households' data.

## Scaling notes

- Items list uses server-side pagination (`range`) and the dedicated `idx_items_*` indexes; default page size 50.
- Full-text search via the `search_text` tsvector + GIN index.
- Photos resized server-side via `sharp` on upload (full = 2000px wide, thumb = 400x400 cropped).
- Reports stream up to 5,000 items in one pass; for very large catalogs paginate `listItems` and append per-page.

## Future ideas

- Multi-photo gallery upload per item
- Sharing read-only report links with insurance agents (signed-link page)
- Multi-currency support
- Mobile-native camera with offline draft queue
- Receipt OCR (use Claude vision against the attachment to auto-fill price/date)
