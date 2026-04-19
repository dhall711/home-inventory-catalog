'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import type { Household, CategorySlug } from '@/lib/types';
import { CATEGORIES } from '@/lib/types';

interface Props {
  household: Household;
  userEmail: string | null;
  existingLocations: { id: string; name: string }[];
  existingCollections: { id: string; name: string }[];
}

const STARTER_ROOMS = [
  'Living Room',
  'Kitchen',
  'Master Bedroom',
  'Bedroom',
  'Office',
  'Garage',
  'Storage',
  'Basement',
  'Dining Room',
];

const STARTER_COLLECTIONS: { name: string; default_category: CategorySlug }[] = [
  { name: 'Fine Jewelry', default_category: 'jewelry' },
  { name: 'Art', default_category: 'art' },
  { name: 'Electronics', default_category: 'electronics' },
  { name: 'Watches', default_category: 'watches' },
  { name: 'Figurines', default_category: 'figurines' },
  { name: 'Native American Jewelry', default_category: 'ethnographic_art' },
  { name: 'Vintage Pipes', default_category: 'pipes' },
  { name: "Decorative Arts (Objet d'Art)", default_category: 'decorative_arts' },
  { name: 'Wine & Spirits', default_category: 'wine_spirits' },
];

const TOTAL_STEPS = 5;

export function OnboardingClient({ household, userEmail, existingLocations, existingCollections }: Props) {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();

  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ---- Step 1: name ----
  const defaultName = useMemo(() => household.name, [household.name]);
  const [name, setName] = useState(defaultName);

  // ---- Step 2: rooms ----
  const existingRoomNames = useMemo(
    () => new Set(existingLocations.map((l) => l.name.toLowerCase())),
    [existingLocations]
  );
  const [pickedRooms, setPickedRooms] = useState<Set<string>>(
    () => new Set(STARTER_ROOMS.filter((r) => existingRoomNames.has(r.toLowerCase())))
  );
  const [customRoom, setCustomRoom] = useState('');
  const [extraRooms, setExtraRooms] = useState<string[]>([]);

  // ---- Step 3: collections ----
  const existingCollectionNames = useMemo(
    () => new Set(existingCollections.map((c) => c.name.toLowerCase())),
    [existingCollections]
  );
  const [pickedCollections, setPickedCollections] = useState<Set<string>>(
    () => new Set(STARTER_COLLECTIONS.filter((c) => existingCollectionNames.has(c.name.toLowerCase())).map((c) => c.name))
  );
  const [customCollection, setCustomCollection] = useState('');
  const [extraCollections, setExtraCollections] = useState<string[]>([]);

  function toggle(set: Set<string>, value: string, setter: (s: Set<string>) => void) {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    setter(next);
  }

  // ---- Save household name ----
  async function saveStep1() {
    setError(null);
    if (!name.trim()) {
      setError('Please give your household a name.');
      return;
    }
    setBusy(true);
    try {
      if (name !== household.name) {
        const { error } = await supabase.from('households').update({ name: name.trim() }).eq('id', household.id);
        if (error) throw error;
      }
      setStep(2);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  // ---- Save rooms ----
  async function saveStep2() {
    setError(null);
    setBusy(true);
    try {
      const desired = [...pickedRooms, ...extraRooms].map((s) => s.trim()).filter(Boolean);
      const toCreate = desired.filter((d) => !existingRoomNames.has(d.toLowerCase()));
      if (toCreate.length > 0) {
        const { error } = await supabase
          .from('locations')
          .insert(toCreate.map((n) => ({ household_id: household.id, name: n })));
        if (error) throw error;
      }
      setStep(3);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  // ---- Save collections ----
  async function saveStep3() {
    setError(null);
    setBusy(true);
    try {
      const startersToCreate = STARTER_COLLECTIONS.filter(
        (c) => pickedCollections.has(c.name) && !existingCollectionNames.has(c.name.toLowerCase())
      );
      const customsToCreate = extraCollections
        .map((c) => c.trim())
        .filter((c) => c && !existingCollectionNames.has(c.toLowerCase()));
      const rows = [
        ...startersToCreate.map((c) => ({ household_id: household.id, name: c.name, default_category: c.default_category })),
        ...customsToCreate.map((c) => ({ household_id: household.id, name: c })),
      ];
      if (rows.length > 0) {
        const { error } = await supabase.from('collections').insert(rows);
        if (error) throw error;
      }
      setStep(4);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function finish() {
    try {
      await fetch('/api/onboarding/skip', { method: 'POST' });
    } catch {}
    router.push('/');
    router.refresh();
  }

  return (
    <div className="max-w-3xl mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Welcome{userEmail ? `, ${userEmail.split('@')[0]}` : ''}</h1>
        <button className="btn-ghost text-sm" onClick={finish} disabled={busy}>
          Skip setup
        </button>
      </div>

      <ProgressBar step={step} total={TOTAL_STEPS} />

      {error && (
        <div className="bg-red-900/30 border border-red-800/50 rounded-md p-3 text-sm text-red-200">{error}</div>
      )}

      {step === 1 && (
        <Card title="Name your household" subtitle="This is how it will appear in reports and the menu.">
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="The Smith Household"
            autoFocus
          />
          <Footer>
            <PrimaryBtn onClick={saveStep1} busy={busy}>Continue</PrimaryBtn>
          </Footer>
        </Card>
      )}

      {step === 2 && (
        <Card title="Pick your rooms" subtitle="We'll use these to organize where each item lives. You can add more later.">
          <div className="flex flex-wrap gap-2">
            {STARTER_ROOMS.map((r) => {
              const on = pickedRooms.has(r);
              return (
                <button
                  key={r}
                  type="button"
                  onClick={() => toggle(pickedRooms, r, setPickedRooms)}
                  className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                    on
                      ? 'bg-brand-700 border-brand-600 text-white'
                      : 'bg-brand-900 border-brand-800 text-brand-200 hover:bg-brand-800'
                  }`}
                >
                  {on ? '✓ ' : '+ '}
                  {r}
                </button>
              );
            })}
          </div>

          <div className="pt-2 border-t border-brand-800">
            <label className="label">Add a custom room</label>
            <div className="flex gap-2">
              <input
                className="input flex-1"
                value={customRoom}
                onChange={(e) => setCustomRoom(e.target.value)}
                placeholder="e.g. Pool House"
              />
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  const v = customRoom.trim();
                  if (v && !extraRooms.includes(v)) {
                    setExtraRooms([...extraRooms, v]);
                    setCustomRoom('');
                  }
                }}
              >
                Add
              </button>
            </div>
            {extraRooms.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {extraRooms.map((r) => (
                  <span key={r} className="px-2 py-1 rounded-full bg-brand-800 text-xs">
                    {r}
                    <button
                      type="button"
                      className="ml-1 text-brand-300 hover:text-red-300"
                      onClick={() => setExtraRooms(extraRooms.filter((x) => x !== r))}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <Footer>
            <SecondaryBtn onClick={() => setStep(1)}>Back</SecondaryBtn>
            <PrimaryBtn onClick={saveStep2} busy={busy}>Continue</PrimaryBtn>
          </Footer>
        </Card>
      )}

      {step === 3 && (
        <Card
          title="Pick collections (optional)"
          subtitle="Collections group related items - jewelry sets, vintage pipes, art, etc."
        >
          <div className="grid sm:grid-cols-2 gap-2">
            {STARTER_COLLECTIONS.map((c) => {
              const on = pickedCollections.has(c.name);
              const catLabel = CATEGORIES.find((x) => x.slug === c.default_category)?.name ?? c.default_category;
              return (
                <button
                  key={c.name}
                  type="button"
                  onClick={() => toggle(pickedCollections, c.name, setPickedCollections)}
                  className={`text-left rounded-lg border p-3 transition-colors ${
                    on
                      ? 'bg-brand-700/40 border-brand-600'
                      : 'bg-brand-900 border-brand-800 hover:bg-brand-800'
                  }`}
                >
                  <div className="text-sm font-medium">{on ? '✓ ' : ''}{c.name}</div>
                  <div className="text-xs text-brand-400">{catLabel}</div>
                </button>
              );
            })}
          </div>

          <div className="pt-2 border-t border-brand-800">
            <label className="label">Add a custom collection</label>
            <div className="flex gap-2">
              <input
                className="input flex-1"
                value={customCollection}
                onChange={(e) => setCustomCollection(e.target.value)}
                placeholder="e.g. Vinyl Records"
              />
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  const v = customCollection.trim();
                  if (v && !extraCollections.includes(v)) {
                    setExtraCollections([...extraCollections, v]);
                    setCustomCollection('');
                  }
                }}
              >
                Add
              </button>
            </div>
            {extraCollections.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {extraCollections.map((c) => (
                  <span key={c} className="px-2 py-1 rounded-full bg-brand-800 text-xs">
                    {c}
                    <button
                      type="button"
                      className="ml-1 text-brand-300 hover:text-red-300"
                      onClick={() => setExtraCollections(extraCollections.filter((x) => x !== c))}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <Footer>
            <SecondaryBtn onClick={() => setStep(2)}>Back</SecondaryBtn>
            <PrimaryBtn onClick={saveStep3} busy={busy}>Continue</PrimaryBtn>
          </Footer>
        </Card>
      )}

      {step === 4 && (
        <Card title="Add your first item" subtitle="Snap a photo and let AI fill in the details. You can keep adding more from there.">
          <div className="grid sm:grid-cols-2 gap-3">
            <Link href="/items/new?onboarding=1" className="card p-5 hover:border-brand-600 transition-colors">
              <div className="text-3xl">📷</div>
              <div className="font-medium mt-2">Add one item</div>
              <p className="text-sm text-brand-300 mt-1">Photograph a single object - AI prefills name, value, and details.</p>
            </Link>
            <Link href="/batch?onboarding=1" className="card p-5 hover:border-brand-600 transition-colors">
              <div className="text-3xl">🖼️</div>
              <div className="font-medium mt-2">Batch capture a room</div>
              <p className="text-sm text-brand-300 mt-1">Upload one wide photo of a room or shelf - AI detects multiple items at once.</p>
            </Link>
          </div>

          <Footer>
            <SecondaryBtn onClick={() => setStep(3)}>Back</SecondaryBtn>
            <SecondaryBtn onClick={() => setStep(5)}>Skip for now</SecondaryBtn>
            <PrimaryBtn onClick={() => setStep(5)}>I&apos;ll come back</PrimaryBtn>
          </Footer>
        </Card>
      )}

      {step === 5 && (
        <Card title="You're all set" subtitle="Here's where to go next.">
          <div className="grid sm:grid-cols-3 gap-3">
            <Tile href="/items" emoji="📦" title="Items" desc="Browse, search, and filter your inventory." />
            <Tile href="/batch" emoji="🖼️" title="Batch capture" desc="Add many items from one photo." />
            <Tile href="/reports" emoji="📄" title="Reports" desc="Export PDF/CSV inventory for insurance." />
          </div>
          <Footer>
            <SecondaryBtn onClick={() => setStep(4)}>Back</SecondaryBtn>
            <PrimaryBtn onClick={finish}>Go to dashboard</PrimaryBtn>
          </Footer>
        </Card>
      )}
    </div>
  );
}

function ProgressBar({ step, total }: { step: number; total: number }) {
  const pct = (step / total) * 100;
  return (
    <div>
      <div className="text-xs text-brand-400 mb-1">Step {step} of {total}</div>
      <div className="h-1.5 bg-brand-900 rounded-full overflow-hidden">
        <div className="h-full bg-brand-500 transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="card p-6 space-y-5">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        {subtitle && <p className="text-sm text-brand-300 mt-1">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

function Footer({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-brand-800">{children}</div>;
}

function PrimaryBtn({ children, onClick, busy }: { children: React.ReactNode; onClick: () => void; busy?: boolean }) {
  return (
    <button className="btn-primary" onClick={onClick} disabled={busy}>
      {busy ? 'Saving...' : children}
    </button>
  );
}

function SecondaryBtn({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button className="btn-secondary" onClick={onClick}>
      {children}
    </button>
  );
}

function Tile({ href, emoji, title, desc }: { href: string; emoji: string; title: string; desc: string }) {
  return (
    <Link href={href} className="card p-5 hover:border-brand-600 transition-colors">
      <div className="text-3xl">{emoji}</div>
      <div className="font-medium mt-2">{title}</div>
      <p className="text-sm text-brand-300 mt-1">{desc}</p>
    </Link>
  );
}
