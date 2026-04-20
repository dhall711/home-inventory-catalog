/**
 * Reusable demo-data seeder. Used by both:
 *   - scripts/seed-demo.ts (CLI)
 *   - app/api/admin/seed-demo (in-app button on /settings)
 *
 * Always pass a service-role Supabase client; we bypass RLS to insert
 * across many tables in a single sweep.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export interface SeedDemoOptions {
  /** Service-role client. Required - we don't try to do this with RLS. */
  admin: SupabaseClient;
  /** Household to seed into. Caller is responsible for verifying access. */
  householdId: string;
  /**
   * If true, wipe existing items, tags, collections, locations, attribute
   * rows, value history, and item_tags for this household before seeding.
   * Default false.
   */
  reset?: boolean;
}

export interface SeedDemoResult {
  inserted: number;
  attempted: number;
  locations: number;
  collections: number;
  tags: number;
  errors: string[];
}

interface DemoItem {
  category: string;
  name: string;
  manufacturer?: string;
  model?: string;
  serial_number?: string;
  description?: string;
  collection?: string;
  location: string;
  acquired_date?: string;
  acquired_price?: number;
  current_value: number;
  notes?: string;
  tags?: string[];
  attributes?: Record<string, string | boolean | number | null>;
  attribute_table?: string;
  custom_attributes?: Record<string, string>;
}

const ROOMS = ['Living Room', 'Master Bedroom', 'Office', 'Garage', 'Storage'];

const COLLECTIONS = [
  { name: 'Vintage Pipes', description: 'Estate and collectible smoking pipes', default_category: 'pipes' },
  { name: 'Native American Jewelry', description: 'Navajo, Zuni, and Hopi silver and turquoise', default_category: 'ethnographic_art' },
  { name: 'Lladró Figurines', description: 'Hand-painted Spanish porcelain figurines', default_category: 'figurines' },
];

const ITEMS: DemoItem[] = [
  // ---- Pipes
  {
    category: 'pipes',
    name: 'Dunhill Bruyere Group 4 Billiard',
    manufacturer: 'Dunhill',
    model: 'Bruyere 4103',
    description: 'Estate pipe, English-made briar with classic billiard shape.',
    collection: 'Vintage Pipes',
    location: 'Office',
    acquired_date: '2018-06-12',
    acquired_price: 320,
    current_value: 480,
    tags: ['english', 'briar', 'estate'],
    attribute_table: 'item_attributes_pipes',
    attributes: { maker: 'Dunhill', country_of_origin: 'England', shape: 'Billiard', material: 'Briar', stem_material: 'Vulcanite', finish: 'Bruyere', length_inches: '5.5', year_made: '1978', estate: true, grade_or_grading: 'Group 4' },
  },
  {
    category: 'pipes',
    name: 'Peterson System Standard 305',
    manufacturer: 'Peterson',
    model: '305',
    collection: 'Vintage Pipes',
    location: 'Office',
    acquired_date: '2020-03-04',
    acquired_price: 140,
    current_value: 165,
    attribute_table: 'item_attributes_pipes',
    attributes: { maker: 'Peterson of Dublin', country_of_origin: 'Ireland', shape: 'Bent Apple', material: 'Briar', finish: 'Smooth' },
  },
  {
    category: 'pipes',
    name: 'Castello Sea Rock Lovat',
    manufacturer: 'Castello',
    model: 'Sea Rock KKK',
    collection: 'Vintage Pipes',
    location: 'Office',
    acquired_date: '2019-11-20',
    acquired_price: 525,
    current_value: 700,
    attribute_table: 'item_attributes_pipes',
    attributes: { maker: 'Castello', country_of_origin: 'Italy', shape: 'Lovat', material: 'Briar', finish: 'Sea Rock (rusticated)' },
  },

  // ---- Native American Jewelry (ethnographic_art)
  {
    category: 'ethnographic_art',
    name: 'Navajo Sterling & Turquoise Squash Blossom Necklace',
    description: 'Sleeping Beauty turquoise cabochons set in heavy hand-stamped sterling.',
    collection: 'Native American Jewelry',
    location: 'Master Bedroom',
    acquired_date: '2015-08-09',
    acquired_price: 2400,
    current_value: 3200,
    tags: ['navajo', 'turquoise', 'sterling'],
    attribute_table: 'item_attributes_ethnographic_art',
    attributes: { culture_or_tribe: 'Navajo', region: 'Southwest US', materials: 'Sterling silver, Sleeping Beauty turquoise', technique: 'Hand-stamped, soldered', period_or_era: 'circa 1970s', signed: false, certificate_authenticity: false },
  },
  {
    category: 'ethnographic_art',
    name: 'Zuni Inlay Sun Face Pendant',
    collection: 'Native American Jewelry',
    location: 'Master Bedroom',
    acquired_date: '2017-02-14',
    acquired_price: 600,
    current_value: 850,
    attribute_table: 'item_attributes_ethnographic_art',
    attributes: { culture_or_tribe: 'Zuni', materials: 'Sterling, turquoise, coral, jet, mother-of-pearl', technique: 'Channel inlay', artist: 'A. Lonjose', signed: true },
  },
  {
    category: 'ethnographic_art',
    name: 'Hopi Overlay Silver Bracelet',
    collection: 'Native American Jewelry',
    location: 'Master Bedroom',
    acquired_price: 480,
    current_value: 700,
    attribute_table: 'item_attributes_ethnographic_art',
    attributes: { culture_or_tribe: 'Hopi', materials: 'Sterling silver', technique: 'Overlay (oxidized cutout)' },
  },

  // ---- Lladró Figurines
  {
    category: 'figurines',
    name: 'Lladró "A New Hat" #5604',
    manufacturer: 'Lladró',
    model: '5604',
    collection: 'Lladró Figurines',
    location: 'Living Room',
    acquired_date: '2014-12-01',
    acquired_price: 220,
    current_value: 310,
    attribute_table: 'item_attributes_figurines',
    attributes: { artist_or_sculptor: 'Lladró', material: 'Porcelain', finish: 'Glazed, hand-painted', year_produced: '1989', original_box: true, retired: true },
  },
  {
    category: 'figurines',
    name: 'Lladró "Don Quixote" #1030',
    manufacturer: 'Lladró',
    model: '1030',
    collection: 'Lladró Figurines',
    location: 'Living Room',
    acquired_price: 750,
    current_value: 1100,
    attribute_table: 'item_attributes_figurines',
    attributes: { material: 'Porcelain', year_produced: '1969', edition_size: 'Open', retired: true, original_box: false },
  },
  {
    category: 'figurines',
    name: 'Lladró "Girl with Lamb" #4505',
    manufacturer: 'Lladró',
    model: '4505',
    collection: 'Lladró Figurines',
    location: 'Living Room',
    current_value: 180,
    attribute_table: 'item_attributes_figurines',
    attributes: { material: 'Porcelain', finish: 'Matte' },
  },

  // ---- Art
  {
    category: 'art',
    name: 'Untitled No. 12 (Abstract Oil)',
    description: 'Mid-century abstract oil on canvas, signed lower right.',
    location: 'Living Room',
    acquired_date: '2010-04-22',
    acquired_price: 1800,
    current_value: 2600,
    tags: ['oil', 'abstract'],
    attribute_table: 'item_attributes_art',
    attributes: { artist: 'M. Rothenberg', medium: 'Oil on canvas', dimensions: '36 x 48 in', year_created: '1962', signed: true, framed: true },
  },
  {
    category: 'art',
    name: 'Ansel Adams "Moonrise" Print',
    location: 'Office',
    acquired_price: 950,
    current_value: 1400,
    attribute_table: 'item_attributes_art',
    attributes: { artist: 'Ansel Adams', medium: 'Gelatin silver print (later edition)', dimensions: '16 x 20 in', signed: false, framed: true },
  },

  // ---- Furniture
  {
    category: 'furniture',
    name: 'Eames Lounge Chair & Ottoman',
    manufacturer: 'Herman Miller',
    location: 'Living Room',
    acquired_date: '2016-09-30',
    acquired_price: 5200,
    current_value: 6800,
    attribute_table: 'item_attributes_furniture',
    attributes: { material: 'Rosewood, leather', dimensions_w_d_h: '32 x 32 x 33 in', designer: 'Charles & Ray Eames', style_period: 'Mid-Century Modern' },
  },
  {
    category: 'furniture',
    name: 'Stickley Mission Oak Sideboard',
    manufacturer: 'Stickley',
    location: 'Living Room',
    acquired_price: 2800,
    current_value: 3400,
    attribute_table: 'item_attributes_furniture',
    attributes: { material: 'Quartersawn white oak', dimensions_w_d_h: '60 x 22 x 42 in', style_period: 'Arts & Crafts' },
  },

  // ---- Electronics
  {
    category: 'electronics',
    name: 'Apple MacBook Pro 16" (M3 Max)',
    manufacturer: 'Apple',
    model: 'A2991',
    serial_number: 'C02XYZ123ABC',
    location: 'Office',
    acquired_date: '2024-01-15',
    acquired_price: 3499,
    current_value: 2800,
    attribute_table: 'item_attributes_electronics',
    attributes: { warranty_until: '2027-01-15', accessories: '96W USB-C charger, original box' },
  },
  {
    category: 'electronics',
    name: 'Sony A7R V Mirrorless Camera',
    manufacturer: 'Sony',
    model: 'ILCE-7RM5',
    serial_number: '4012345',
    location: 'Office',
    acquired_date: '2023-05-01',
    acquired_price: 3899,
    current_value: 3000,
    attribute_table: 'item_attributes_electronics',
    attributes: { accessories: '24-105mm f/4 G lens, 2 batteries, charger' },
  },
  {
    category: 'electronics',
    name: 'Sonos Arc Soundbar',
    manufacturer: 'Sonos',
    location: 'Living Room',
    acquired_date: '2022-11-04',
    acquired_price: 899,
    current_value: 700,
    attribute_table: 'item_attributes_electronics',
  },

  // ---- Jewelry (modern fine, not ethnographic)
  {
    category: 'jewelry',
    name: 'Tiffany Solitaire Diamond Ring',
    manufacturer: 'Tiffany & Co.',
    location: 'Master Bedroom',
    acquired_date: '2008-06-21',
    acquired_price: 6500,
    current_value: 9200,
    attribute_table: 'item_attributes_jewelry',
    attributes: { metal: 'Platinum', stones: 'Diamond (round brilliant)', carat_weight: '1.05 ct', appraisal_date: '2023-06-01' },
  },

  // ---- Watches
  {
    category: 'watches',
    name: 'Omega Speedmaster Professional',
    manufacturer: 'Omega',
    model: 'Moonwatch 310.30.42.50.01.001',
    serial_number: '88775533',
    location: 'Master Bedroom',
    acquired_date: '2021-09-12',
    acquired_price: 6500,
    current_value: 7400,
    attribute_table: 'item_attributes_watches',
    attributes: { movement: 'Manual-wind Caliber 3861', case_material: 'Stainless steel', case_size: '42mm', band_material: 'Stainless steel bracelet', box_papers: true },
  },

  // ---- Decorative arts
  {
    category: 'decorative_arts',
    name: 'Tiffany Studios Favrile Glass Vase',
    manufacturer: 'Tiffany Studios',
    location: 'Living Room',
    acquired_price: 3200,
    current_value: 4500,
    custom_attributes: { 'maker_mark': 'L.C.T. inscribed on base', 'period': 'circa 1905' },
  },
  {
    category: 'decorative_arts',
    name: 'Baccarat Crystal Decanter',
    manufacturer: 'Baccarat',
    location: 'Living Room',
    acquired_price: 600,
    current_value: 800,
  },

  // ---- Musical instruments
  {
    category: 'musical_instruments',
    name: 'Martin D-28 Acoustic Guitar',
    manufacturer: 'C.F. Martin & Co.',
    model: 'D-28',
    serial_number: '2245678',
    location: 'Office',
    acquired_date: '2019-04-04',
    acquired_price: 3299,
    current_value: 3700,
    attribute_table: 'item_attributes_musical_instruments',
    attributes: { instrument_type: 'Acoustic guitar', body_material: 'Sitka spruce top, East Indian rosewood back/sides', year_made: '2019', case_included: true },
  },

  // ---- Collectibles / misc
  {
    category: 'collectibles',
    name: '1986 Topps Traded Bonds Rookie Card',
    location: 'Storage',
    acquired_price: 80,
    current_value: 150,
    attribute_table: 'item_attributes_collectibles',
    attributes: { grade: 'PSA 8', certification: 'PSA' },
  },
  {
    category: 'collectibles',
    name: 'Vintage Hermes Silk Scarf "Brides de Gala"',
    manufacturer: 'Hermès',
    location: 'Master Bedroom',
    acquired_price: 350,
    current_value: 480,
    tags: ['silk', 'fashion'],
  },

  // ---- Wine / spirits
  {
    category: 'wine_spirits',
    name: 'Pappy Van Winkle 15-Year Bourbon',
    manufacturer: 'Old Rip Van Winkle Distillery',
    location: 'Storage',
    acquired_date: '2022-12-22',
    acquired_price: 120,
    current_value: 1100,
    attribute_table: 'item_attributes_wine_spirits',
    attributes: { producer: 'Pappy Van Winkle', vintage: '2022', bottle_size: '750ml', type: 'Bourbon whiskey', abv: '53.5%', region: 'Kentucky', country: 'USA' },
  },
];

const ITEM_ATTRIBUTE_TABLES = [
  'item_attributes_art',
  'item_attributes_electronics',
  'item_attributes_jewelry',
  'item_attributes_furniture',
  'item_attributes_watches',
  'item_attributes_collectibles',
  'item_attributes_figurines',
  'item_attributes_ethnographic_art',
  'item_attributes_decorative_arts',
  'item_attributes_pipes',
  'item_attributes_musical_instruments',
  'item_attributes_coins_currency',
  'item_attributes_stamps',
  'item_attributes_firearms',
  'item_attributes_wine_spirits',
];

export async function seedDemo(options: SeedDemoOptions): Promise<SeedDemoResult> {
  const { admin, householdId, reset = false } = options;
  const errors: string[] = [];

  if (reset) {
    await wipeBefore(admin, householdId);
  }

  const locByName = new Map<string, string>();
  for (const room of ROOMS) {
    try {
      const id = await ensureRow(admin, 'locations', { household_id: householdId, name: room });
      locByName.set(room, id);
    } catch (e) {
      errors.push(`location "${room}": ${(e as Error).message}`);
    }
  }

  const colByName = new Map<string, string>();
  for (const c of COLLECTIONS) {
    try {
      const id = await ensureRow(admin, 'collections', {
        household_id: householdId,
        name: c.name,
        description: c.description,
        default_category: c.default_category,
      });
      colByName.set(c.name, id);
    } catch (e) {
      errors.push(`collection "${c.name}": ${(e as Error).message}`);
    }
  }

  const allTagNames = Array.from(new Set(ITEMS.flatMap((i) => i.tags ?? [])));
  const tagByName = new Map<string, string>();
  for (const name of allTagNames) {
    try {
      const id = await ensureRow(admin, 'tags', { household_id: householdId, name });
      tagByName.set(name, id);
    } catch (e) {
      errors.push(`tag "${name}": ${(e as Error).message}`);
    }
  }

  let inserted = 0;
  for (const it of ITEMS) {
    const locationId = locByName.get(it.location);
    const collectionId = it.collection ? colByName.get(it.collection) : null;

    const { data: item, error } = await admin
      .from('items')
      .insert({
        household_id: householdId,
        category: it.category,
        name: it.name,
        manufacturer: it.manufacturer,
        model: it.model,
        serial_number: it.serial_number,
        description: it.description,
        notes: it.notes,
        location_id: locationId,
        collection_id: collectionId,
        acquired_date: it.acquired_date,
        acquired_price: it.acquired_price,
        current_value: it.current_value,
        current_value_source: 'manual',
        current_value_updated_at: new Date().toISOString(),
        custom_attributes: it.custom_attributes ?? null,
        status: 'active',
      })
      .select('id')
      .single();

    if (error || !item) {
      errors.push(`item "${it.name}": ${error?.message ?? 'unknown error'}`);
      continue;
    }
    inserted++;

    if (it.attribute_table && it.attributes) {
      const { error: attrErr } = await admin
        .from(it.attribute_table)
        .insert({ item_id: item.id, ...it.attributes });
      if (attrErr) errors.push(`attrs "${it.name}" (${it.attribute_table}): ${attrErr.message}`);
    }

    if (it.tags && it.tags.length > 0) {
      const rows = it.tags
        .map((t) => tagByName.get(t))
        .filter((id): id is string => !!id)
        .map((tag_id) => ({ item_id: item.id, tag_id }));
      if (rows.length > 0) {
        const { error: tagErr } = await admin.from('item_tags').insert(rows);
        if (tagErr) errors.push(`tags "${it.name}": ${tagErr.message}`);
      }
    }

    if (it.acquired_price && it.acquired_date && it.current_value) {
      const start = new Date(it.acquired_date);
      const mid = new Date(start);
      mid.setFullYear(mid.getFullYear() + 1);
      const today = new Date();
      const midValue = Math.round((it.acquired_price + it.current_value) / 2);
      await admin.from('value_history').insert([
        { item_id: item.id, value: it.acquired_price, source: 'receipt', dated_on: it.acquired_date, notes: 'Original purchase' },
        { item_id: item.id, value: midValue, source: 'manual', dated_on: dateOnly(mid), notes: 'Mid-period estimate' },
        { item_id: item.id, value: it.current_value, source: 'ai', dated_on: dateOnly(today), notes: 'Latest valuation' },
      ]);
    }
  }

  return {
    inserted,
    attempted: ITEMS.length,
    locations: locByName.size,
    collections: colByName.size,
    tags: tagByName.size,
    errors,
  };
}

async function wipeBefore(admin: SupabaseClient, householdId: string): Promise<void> {
  const { data: items } = await admin.from('items').select('id').eq('household_id', householdId);
  const itemIds = (items ?? []).map((r: { id: string }) => r.id);
  if (itemIds.length > 0) {
    await admin.from('value_history').delete().in('item_id', itemIds);
    await admin.from('item_tags').delete().in('item_id', itemIds);
    await admin.from('item_photos').delete().in('item_id', itemIds);
    await admin.from('item_attachments').delete().in('item_id', itemIds);
    for (const t of ITEM_ATTRIBUTE_TABLES) {
      await admin.from(t).delete().in('item_id', itemIds);
    }
  }
  await admin.from('items').delete().eq('household_id', householdId);
  await admin.from('tags').delete().eq('household_id', householdId);
  await admin.from('collections').delete().eq('household_id', householdId);
  await admin.from('locations').delete().eq('household_id', householdId);
}

async function ensureRow(
  admin: SupabaseClient,
  table: string,
  payload: Record<string, unknown>
): Promise<string> {
  const filter: Record<string, unknown> = {
    household_id: payload.household_id,
    name: payload.name,
  };
  const { data: existing } = await admin.from(table).select('id').match(filter).maybeSingle();
  if (existing) return (existing as { id: string }).id;
  const { data, error } = await admin.from(table).insert(payload).select('id').single();
  if (error || !data) throw new Error(`Insert into ${table} failed: ${error?.message ?? 'unknown'}`);
  return (data as { id: string }).id;
}

function dateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}
