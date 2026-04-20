'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface Props {
  isOwner: boolean;
}

interface SeedResult {
  inserted: number;
  attempted: number;
  locations: number;
  collections: number;
  tags: number;
  errors: string[];
}

export function SeedDemoPanel({ isOwner }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [reset, setReset] = useState(false);
  const [result, setResult] = useState<SeedResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!isOwner) return null;

  async function runSeed() {
    if (reset && !confirm('Reset will DELETE all existing items, tags, collections, and locations in this household before seeding. Continue?')) {
      return;
    }
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch('/api/admin/seed-demo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reset }),
      });
      const text = await res.text();
      let json: { error?: string } & Partial<SeedResult> = {};
      if (text) {
        try {
          json = JSON.parse(text);
        } catch {
          throw new Error(`Server returned ${res.status}: ${text.slice(0, 200) || res.statusText}`);
        }
      }
      if (!res.ok) throw new Error(json.error ?? `Seed failed (HTTP ${res.status})`);
      setResult({
        inserted: json.inserted ?? 0,
        attempted: json.attempted ?? 0,
        locations: json.locations ?? 0,
        collections: json.collections ?? 0,
        tags: json.tags ?? 0,
        errors: json.errors ?? [],
      });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card p-5 space-y-3">
      <div>
        <h2 className="font-semibold">Demo data</h2>
        <p className="text-sm text-brand-300 mt-1">
          Populate this household with about 25 sample items across categories
          (pipes, ethnographic art, figurines, art, furniture, electronics,
          jewelry, watches, decorative arts, instruments, collectibles, wine),
          5 rooms, 3 named collections, tags, and synthetic value-history
          timelines. Useful for screenshots, reports, and exploring features
          before adding your own data. No photos are added.
        </p>
      </div>

      {result && (
        <div className="bg-emerald-900/30 border border-emerald-800/50 rounded-md p-3 text-sm text-emerald-200 space-y-1">
          <div>
            Seeded {result.inserted}/{result.attempted} items, {result.locations} rooms,{' '}
            {result.collections} collections, {result.tags} tags.
          </div>
          {result.errors.length > 0 && (
            <details className="text-xs text-amber-200">
              <summary className="cursor-pointer">{result.errors.length} non-fatal warnings</summary>
              <ul className="mt-1 list-disc pl-5 space-y-0.5">
                {result.errors.slice(0, 20).map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
                {result.errors.length > 20 && <li>...and {result.errors.length - 20} more</li>}
              </ul>
            </details>
          )}
        </div>
      )}

      {error && (
        <div className="bg-red-900/30 border border-red-800/50 rounded-md p-3 text-sm text-red-200">
          {error}
        </div>
      )}

      <label className="flex items-center gap-2 text-sm text-brand-200">
        <input
          type="checkbox"
          checked={reset}
          onChange={(e) => setReset(e.target.checked)}
          disabled={busy}
        />
        Reset first (delete existing items, tags, collections, locations)
      </label>

      <button className="btn-primary" onClick={runSeed} disabled={busy}>
        {busy ? 'Seeding...' : reset ? 'Reset and seed demo data' : 'Seed demo data'}
      </button>
    </section>
  );
}
