import { NextResponse } from 'next/server';
import { requireHousehold, requireUser } from '@/lib/household';
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import type { CategorySlug, Item, ItemFilters, ItemStatus, SortOption } from '@/lib/types';
import { listItems } from '@/lib/items';
import { toCsv } from '@/lib/csv';
import { renderReportPdfBuffer, prefetchItemImages } from '@/lib/pdfReport';
import { REPORTS_BUCKET, buildReportPath } from '@/lib/storage';
import { formatCurrency, formatDate } from '@/lib/format';

export const runtime = 'nodejs';
// PDF generation with many items + images can take a while. Bump above the
// default 10s Hobby limit; Vercel will cap this to your plan max.
export const maxDuration = 60;

interface ReportRequest {
  name: string;
  filters: ItemFilters;
  formats: ('pdf' | 'csv')[];
}

export async function POST(request: Request) {
  try {
    const household = await requireHousehold();
    const user = await requireUser();
    const supabase = await createSupabaseServerClient();
    const body = (await request.json()) as ReportRequest;
    const filters: ItemFilters = { ...(body.filters ?? {}), page: 1, page_size: 5000 };

    const { items, total } = await listItems(household.id, filters);

    const locIds = Array.from(new Set(items.map((i) => i.location_id).filter(Boolean))) as string[];
    const { data: locs } = locIds.length
      ? await supabase.from('locations').select('id, name').in('id', locIds)
      : { data: [] as { id: string; name: string }[] };
    const locMap = new Map((locs ?? []).map((l) => [l.id, l.name]));
    const locationNames: Record<string, string> = Object.fromEntries(locMap);

    const totalValue = items.reduce((s, i) => s + (Number(i.current_value) || 0), 0);
    const filtersDescription = describeFilters(body.filters);

    const formats = body.formats?.length ? body.formats : ['pdf', 'csv'];
    const supa = createSupabaseServiceRoleClient();
    let pdfUrl: string | null = null;
    let csvUrl: string | null = null;

    if (formats.includes('pdf')) {
      // Pre-fetch images server-side so a single broken/slow URL can't hang
      // or crash the PDF render. Items whose images fail render without a photo.
      const embeddedImages = await prefetchItemImages(items as Item[]);
      const buf = await renderReportPdfBuffer({
        householdName: household.name,
        currency: household.currency,
        items: items.map((it) => ({ ...it })) as Item[],
        generatedAt: new Date(),
        filtersDescription,
        locationNames,
        embeddedImages,
      });
      const path = buildReportPath(household.id, body.name || 'inventory', 'pdf');
      const { error } = await supa.storage.from(REPORTS_BUCKET).upload(path, buf, {
        contentType: 'application/pdf',
      });
      if (error) return NextResponse.json({ error: `PDF upload failed: ${error.message}` }, { status: 500 });
      const { data: signed } = await supa.storage.from(REPORTS_BUCKET).createSignedUrl(path, 60 * 60 * 24 * 7);
      pdfUrl = signed?.signedUrl ?? null;
    }

    if (formats.includes('csv')) {
      const headers = ['Name', 'Category', 'Manufacturer', 'Model', 'Serial #', 'Location', 'Condition',
                       'Acquired Date', 'Acquired Price', 'Current Value', 'Value Source', 'Notes'];
      const rows = items.map((it) => [
        it.name,
        it.category,
        it.manufacturer,
        it.model,
        it.serial_number,
        it.location_id ? locMap.get(it.location_id) ?? '' : '',
        it.condition,
        formatDate(it.acquired_date),
        it.acquired_price != null ? formatCurrency(it.acquired_price, household.currency) : '',
        it.current_value != null ? formatCurrency(it.current_value, household.currency) : '',
        it.current_value_source,
        it.notes,
      ]);
      const csv = toCsv(headers, rows);
      const path = buildReportPath(household.id, body.name || 'inventory', 'csv');
      const { error } = await supa.storage.from(REPORTS_BUCKET).upload(path, Buffer.from(csv, 'utf-8'), {
        contentType: 'text/csv',
      });
      if (error) return NextResponse.json({ error: `CSV upload failed: ${error.message}` }, { status: 500 });
      const { data: signed } = await supa.storage.from(REPORTS_BUCKET).createSignedUrl(path, 60 * 60 * 24 * 7);
      csvUrl = signed?.signedUrl ?? null;
    }

    await supabase.from('reports').insert({
      household_id: household.id,
      name: body.name || 'Inventory report',
      filters_json: body.filters ?? {},
      item_count: total,
      total_value: totalValue,
      pdf_url: pdfUrl,
      csv_url: csvUrl,
      created_by: user.id,
    });

    return NextResponse.json({
      item_count: total,
      total_value: totalValue,
      pdf_url: pdfUrl,
      csv_url: csvUrl,
    });
  } catch (err) {
    // Always return JSON so the client never sees an empty body / parse error.
    const message = err instanceof Error ? err.message : 'Report generation failed';
    console.error('[api/reports] failed:', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function describeFilters(f: ItemFilters | undefined): string {
  if (!f) return 'All items';
  const parts: string[] = [];
  if (f.category) parts.push(`category=${f.category as CategorySlug}`);
  if (f.status) parts.push(`status=${f.status as ItemStatus}`);
  if (f.location_id) parts.push('location filter');
  if (f.collection_id) parts.push('collection filter');
  if (f.tag_id) parts.push('tag filter');
  if (typeof f.min_value === 'number') parts.push(`min_value=${f.min_value}`);
  if (typeof f.max_value === 'number') parts.push(`max_value=${f.max_value}`);
  if (f.has_serial) parts.push('has serial');
  if (f.q) parts.push(`q="${f.q}"`);
  if (f.sort) parts.push(`sort=${f.sort as SortOption}`);
  return parts.length ? parts.join(', ') : 'All items';
}
