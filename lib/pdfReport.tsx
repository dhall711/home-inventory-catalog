/* eslint-disable jsx-a11y/alt-text */
import React from 'react';
import { Document, Page, Text, View, StyleSheet, Image, renderToBuffer } from '@react-pdf/renderer';
import type { Item } from '@/lib/types';
import { formatCurrency, formatDate } from '@/lib/format';

const styles = StyleSheet.create({
  page: { padding: 28, fontSize: 10, fontFamily: 'Helvetica', color: '#222' },
  cover: { padding: 60 },
  coverTitle: { fontSize: 28, marginBottom: 8, fontFamily: 'Helvetica-Bold' },
  coverSub: { fontSize: 12, color: '#555', marginBottom: 24 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6, fontSize: 11 },
  totalBox: { marginTop: 28, padding: 16, border: '1pt solid #888', borderRadius: 4 },
  groupTitle: { fontSize: 14, marginTop: 18, marginBottom: 6, fontFamily: 'Helvetica-Bold' },
  row: { flexDirection: 'row', borderBottom: '0.5pt solid #ccc', paddingVertical: 6, alignItems: 'flex-start' },
  thumb: { width: 48, height: 48, marginRight: 8, objectFit: 'cover' },
  cellName: { flex: 2, paddingRight: 4 },
  cell: { flex: 1, paddingRight: 4 },
  cellRight: { flex: 1, textAlign: 'right' },
  headerRow: { flexDirection: 'row', borderBottom: '1pt solid #444', paddingBottom: 4, fontFamily: 'Helvetica-Bold' },
  bold: { fontFamily: 'Helvetica-Bold' },
  subtotal: { textAlign: 'right', marginTop: 4, fontSize: 11, fontFamily: 'Helvetica-Bold' },
  footer: { position: 'absolute', bottom: 16, left: 28, right: 28, fontSize: 8, color: '#888', textAlign: 'center' },
});

interface ReportInput {
  householdName: string;
  currency: string;
  items: Item[];
  generatedAt: Date;
  filtersDescription: string;
  /** Optional resolved location names keyed by location_id. */
  locationNames?: Record<string, string>;
  /**
   * Pre-fetched image bytes keyed by URL. Passing real bytes lets us avoid
   * @react-pdf/renderer doing its own remote fetches, which can hang or
   * crash the entire PDF render if a single image URL is slow or returns
   * a non-200. Anything not in this map is rendered without a photo.
   */
  embeddedImages?: Record<string, string>; // data: URI per source URL
}

function groupByCategory(items: Item[]): Record<string, Item[]> {
  const groups: Record<string, Item[]> = {};
  for (const it of items) {
    const k = it.category || 'other';
    if (!groups[k]) groups[k] = [];
    groups[k].push(it);
  }
  return groups;
}

const InsuranceReport: React.FC<ReportInput> = ({ householdName, currency, items, generatedAt, filtersDescription, locationNames, embeddedImages }) => {
  const total = items.reduce((s, i) => s + (Number(i.current_value) || 0), 0);
  const groups = groupByCategory(items);

  return (
    <Document>
      <Page size="LETTER" style={styles.cover}>
        <Text style={styles.coverTitle}>Insurance Inventory Schedule</Text>
        <Text style={styles.coverSub}>{householdName}</Text>
        <View style={styles.metaRow}><Text>Generated</Text><Text>{generatedAt.toLocaleString()}</Text></View>
        <View style={styles.metaRow}><Text>Items included</Text><Text>{items.length}</Text></View>
        <View style={styles.metaRow}><Text>Filters</Text><Text>{filtersDescription || 'All active items'}</Text></View>
        <View style={styles.totalBox}>
          <Text style={[styles.bold, { fontSize: 14 }]}>Total declared value</Text>
          <Text style={{ fontSize: 22, marginTop: 6 }}>{formatCurrency(total, currency)}</Text>
        </View>
      </Page>

      {Object.entries(groups).map(([cat, list]) => {
        const subtotal = list.reduce((s, i) => s + (Number(i.current_value) || 0), 0);
        return (
          <Page size="LETTER" style={styles.page} key={cat}>
            <Text style={styles.groupTitle}>{cat.replace('_', ' ').toUpperCase()} ({list.length})</Text>
            <View style={styles.headerRow}>
              <Text style={{ width: 56 }}>Photo</Text>
              <Text style={styles.cellName}>Name / Description</Text>
              <Text style={styles.cell}>Make / Model</Text>
              <Text style={styles.cell}>Serial</Text>
              <Text style={styles.cell}>Location</Text>
              <Text style={styles.cell}>Acquired</Text>
              <Text style={styles.cellRight}>Value</Text>
            </View>
            {list.map((it) => {
              const photoUrl = it.primary_photo_thumb_url ?? it.primary_photo_url ?? null;
              const embedded = photoUrl && embeddedImages ? embeddedImages[photoUrl] : null;
              return (
                <View style={styles.row} key={it.id} wrap={false}>
                  <View style={{ width: 56 }}>
                    {embedded ? <Image style={styles.thumb} src={embedded} /> : null}
                  </View>
                  <View style={styles.cellName}>
                    <Text style={styles.bold}>{it.name}</Text>
                    {it.description ? <Text style={{ color: '#666' }}>{it.description}</Text> : null}
                  </View>
                  <Text style={styles.cell}>{[it.manufacturer, it.model].filter(Boolean).join(' ')}</Text>
                  <Text style={styles.cell}>{it.serial_number ?? ''}</Text>
                  <Text style={styles.cell}>{it.location_id ? (locationNames?.[it.location_id] ?? '') : ''}</Text>
                  <Text style={styles.cell}>
                    {formatDate(it.acquired_date)}{it.acquired_price != null ? `\n${formatCurrency(it.acquired_price, currency)}` : ''}
                  </Text>
                  <Text style={styles.cellRight}>
                    {it.current_value != null ? formatCurrency(it.current_value, currency) : '—'}
                  </Text>
                </View>
              );
            })}
            <Text style={styles.subtotal}>Subtotal: {formatCurrency(subtotal, currency)}</Text>
            <Text style={styles.footer} render={({ pageNumber, totalPages }) => `${householdName} - Page ${pageNumber} of ${totalPages}`} fixed />
          </Page>
        );
      })}
    </Document>
  );
};

export async function renderReportPdfBuffer(input: ReportInput): Promise<Buffer> {
  // renderToBuffer is the canonical Node-side API. The browser-style
  // `pdf().toBlob()` path requires a Blob polyfill in Node and has been
  // less reliable on serverless runtimes.
  return await renderToBuffer(<InsuranceReport {...input} />);
}

const MAX_IMAGE_BYTES = 1_500_000; // 1.5 MB per image cap to keep PDFs reasonable

async function fetchImageAsDataUri(url: string, timeoutMs = 5000): Promise<string | null> {
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(t);
    if (!res.ok) return null;
    const ctype = res.headers.get('content-type') || '';
    // react-pdf supports png and jpeg
    if (!/^image\/(png|jpeg|jpg)/i.test(ctype)) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength === 0 || buf.byteLength > MAX_IMAGE_BYTES) return null;
    const mime = /png/i.test(ctype) ? 'image/png' : 'image/jpeg';
    return `data:${mime};base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}

/**
 * Pre-fetch the primary photo for each item with a per-image timeout. Failures
 * are skipped silently — the item just renders without a photo. This avoids
 * @react-pdf/renderer's default behavior of synchronously fetching each
 * <Image src="https://..."> during render, which can hang the entire PDF.
 */
export async function prefetchItemImages(items: Item[]): Promise<Record<string, string>> {
  const urls = Array.from(
    new Set(
      items
        .map((i) => i.primary_photo_thumb_url ?? i.primary_photo_url ?? null)
        .filter((u): u is string => !!u)
    )
  );
  const out: Record<string, string> = {};
  const concurrency = 8;
  for (let i = 0; i < urls.length; i += concurrency) {
    const slice = urls.slice(i, i + concurrency);
    const results = await Promise.all(slice.map((u) => fetchImageAsDataUri(u)));
    slice.forEach((u, idx) => {
      const v = results[idx];
      if (v) out[u] = v;
    });
  }
  return out;
}
