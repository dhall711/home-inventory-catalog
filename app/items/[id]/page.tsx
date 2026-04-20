import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireHousehold } from '@/lib/household';
import { getItemDetail } from '@/lib/items';
import { CATEGORY_ATTRIBUTES, type CategorySlug } from '@/lib/types';
import { formatCurrency, formatDate } from '@/lib/format';
import { ValueHistoryChart } from '@/components/ValueHistoryChart';
import { AttachmentsPanel } from '@/components/AttachmentsPanel';
import { ItemActions } from '@/components/ItemActions';
import { ItemPhotosWithScan } from '@/components/ItemPhotosWithScan';

export const dynamic = 'force-dynamic';

export default async function ItemDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const household = await requireHousehold();
  const detail = await getItemDetail(household.id, id);
  if (!detail) notFound();
  const { item, photos, attachments, valueHistory, tags, attributes } = detail;
  const fields = CATEGORY_ATTRIBUTES[item.category as CategorySlug] ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <Link href="/items" className="text-sm text-brand-300 hover:text-brand-100">&larr; All items</Link>
          <h1 className="text-2xl font-semibold mt-1">{item.name}</h1>
          <div className="text-sm text-brand-300 capitalize">{item.category.replace('_', ' ')}</div>
        </div>
        <div className="flex gap-2">
          <Link href={`/items/${item.id}/edit`} className="btn-secondary">Edit</Link>
          <ItemActions itemId={item.id} category={item.category as CategorySlug} />
        </div>
      </div>

      <div className="grid lg:grid-cols-[360px_1fr] gap-6">
        <div className="space-y-4">
          <ItemPhotosWithScan
            itemId={item.id}
            itemName={item.name}
            initialPhotos={photos}
            fallbackPrimary={{
              url: item.primary_photo_url,
              thumb_url: item.primary_photo_thumb_url,
            }}
            itemSnapshot={{
              acquired_date: item.acquired_date,
              acquired_from: item.acquired_from,
              acquired_price: item.acquired_price,
              current_value: item.current_value,
              manufacturer: item.manufacturer,
              model: item.model,
              serial_number: item.serial_number,
              notes: item.notes,
            }}
            category={item.category}
          />

          <div className="card p-4 space-y-2">
            <div className="text-2xl font-semibold text-accent">
              {item.current_value != null ? formatCurrency(item.current_value, household.currency) : '—'}
            </div>
            <div className="text-xs text-brand-300">
              Source: {item.current_value_source ?? '—'}
              {item.current_value_updated_at && ` • Updated ${formatDate(item.current_value_updated_at)}`}
            </div>
          </div>

          {valueHistory.length > 0 && (
            <div className="card p-4">
              <div className="text-sm font-medium mb-2">Value history</div>
              <ValueHistoryChart points={valueHistory} currency={household.currency} />
            </div>
          )}

          <AttachmentsPanel
            itemId={item.id}
            initial={attachments}
            itemSnapshot={{
              acquired_date: item.acquired_date,
              acquired_from: item.acquired_from,
              acquired_price: item.acquired_price,
              current_value: item.current_value,
              manufacturer: item.manufacturer,
              model: item.model,
              serial_number: item.serial_number,
              notes: item.notes,
            }}
            category={item.category}
          />
        </div>

        <div className="space-y-4">
          <Section title="Description">
            <p className="text-sm whitespace-pre-wrap text-brand-100">{item.description ?? '—'}</p>
          </Section>

          <Section title="Identification">
            <Grid>
              <Cell label="Manufacturer" value={item.manufacturer} />
              <Cell label="Model" value={item.model} />
              <Cell label="Serial #" value={item.serial_number} />
              <Cell label="Condition" value={item.condition} />
              <Cell label="Status" value={item.status} />
            </Grid>
          </Section>

          <Section title="Acquisition">
            <Grid>
              <Cell label="Acquired" value={formatDate(item.acquired_date)} />
              <Cell label="From" value={item.acquired_from} />
              <Cell label="Price" value={item.acquired_price != null ? formatCurrency(item.acquired_price, household.currency) : '—'} />
            </Grid>
          </Section>

          {fields.length > 0 && attributes && (
            <Section title={`${item.category} details`}>
              <Grid>
                {fields.map((f) => {
                  const v = attributes[f.key];
                  return <Cell key={f.key} label={f.label} value={f.type === 'boolean' ? (v ? 'Yes' : 'No') : (v as string | null | undefined)} />;
                })}
              </Grid>
            </Section>
          )}

          {tags.length > 0 && (
            <Section title="Tags">
              <div className="flex flex-wrap gap-1">
                {tags.map((t) => <span key={t.id} className="chip">{t.name}</span>)}
              </div>
            </Section>
          )}

          {item.notes && (
            <Section title="Notes">
              <p className="text-sm whitespace-pre-wrap text-brand-100">{item.notes}</p>
            </Section>
          )}
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card p-4 space-y-2">
      <div className="text-xs uppercase tracking-wider text-brand-300">{title}</div>
      <div>{children}</div>
    </div>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">{children}</div>;
}

function Cell({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div>
      <div className="text-xs text-brand-400">{label}</div>
      <div className="text-brand-100">{value == null || value === '' ? '—' : String(value)}</div>
    </div>
  );
}
