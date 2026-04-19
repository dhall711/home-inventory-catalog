/* eslint-disable jsx-a11y/alt-text */
import React from 'react';
import { Document, Page, Text, View, StyleSheet, Image, pdf } from '@react-pdf/renderer';
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

const InsuranceReport: React.FC<ReportInput> = ({ householdName, currency, items, generatedAt, filtersDescription }) => {
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
            {list.map((it) => (
              <View style={styles.row} key={it.id} wrap={false}>
                <View style={{ width: 56 }}>
                  {(it.primary_photo_thumb_url || it.primary_photo_url) ? (
                    <Image style={styles.thumb} src={it.primary_photo_thumb_url ?? it.primary_photo_url ?? ''} />
                  ) : null}
                </View>
                <View style={styles.cellName}>
                  <Text style={styles.bold}>{it.name}</Text>
                  {it.description ? <Text style={{ color: '#666' }}>{it.description}</Text> : null}
                </View>
                <Text style={styles.cell}>{[it.manufacturer, it.model].filter(Boolean).join(' ')}</Text>
                <Text style={styles.cell}>{it.serial_number ?? ''}</Text>
                <Text style={styles.cell}>{it.location_id ? '' : ''}</Text>
                <Text style={styles.cell}>
                  {formatDate(it.acquired_date)}{it.acquired_price != null ? `\n${formatCurrency(it.acquired_price, currency)}` : ''}
                </Text>
                <Text style={styles.cellRight}>
                  {it.current_value != null ? formatCurrency(it.current_value, currency) : '—'}
                </Text>
              </View>
            ))}
            <Text style={styles.subtotal}>Subtotal: {formatCurrency(subtotal, currency)}</Text>
            <Text style={styles.footer} render={({ pageNumber, totalPages }) => `${householdName} - Page ${pageNumber} of ${totalPages}`} fixed />
          </Page>
        );
      })}
    </Document>
  );
};

export async function renderReportPdfBuffer(input: ReportInput): Promise<Buffer> {
  const blob = await pdf(<InsuranceReport {...input} />).toBlob();
  const arr = await blob.arrayBuffer();
  return Buffer.from(arr);
}
