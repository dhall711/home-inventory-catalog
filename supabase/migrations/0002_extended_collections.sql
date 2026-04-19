-- =====================================================================
-- Home Inventory Catalog - Extended Collections Migration
-- Adds collection-oriented categories (figurines, ethnographic art,
-- decorative arts, vintage pipes), a flexible custom_attributes JSONB
-- on items, and richer collections (cover photo + default category).
-- Idempotent. Safe to run after 0001_initial_schema.sql.
-- =====================================================================

-- ---------------------------------------------------------------------
-- New category slugs
-- ---------------------------------------------------------------------
insert into public.categories (slug, name, sort_order) values
    ('figurines',         'Figurines',                  65),
    ('ethnographic_art',  'Ethnographic Art & Jewelry', 67),
    ('decorative_arts',   'Decorative Arts (Objet d''Art)', 75),
    ('pipes',             'Pipes',                      85),
    ('musical_instruments','Musical Instruments',       95),
    ('coins_currency',    'Coins & Currency',           105),
    ('stamps',            'Stamps',                     115),
    ('firearms',          'Firearms',                   125),
    ('wine_spirits',      'Wine & Spirits',             135)
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------
-- Per-category attribute tables for the new collection types
-- ---------------------------------------------------------------------

-- Figurines (Lladró, Hummel, Royal Doulton, Limited editions, anime, etc.)
create table if not exists public.item_attributes_figurines (
    item_id uuid primary key references public.items(id) on delete cascade,
    artist_or_sculptor text,
    series text,
    edition_number text,
    edition_size text,
    material text,                 -- porcelain, bronze, resin, ceramic
    finish text,                   -- glazed, matte, hand-painted
    dimensions text,               -- e.g. "12 x 6 x 4 in"
    year_produced text,
    marks_signature text,          -- backstamp, signature, mold mark
    original_box boolean,
    coa boolean,                   -- certificate of authenticity
    retired boolean
);

-- Ethnographic art & jewelry (Native American, Pre-Columbian, African,
-- Asian tribal, Aboriginal, etc.) - covers both art objects and jewelry.
create table if not exists public.item_attributes_ethnographic_art (
    item_id uuid primary key references public.items(id) on delete cascade,
    culture_or_tribe text,         -- e.g. Navajo, Hopi, Zuni, Acoma, Plains
    artist text,                   -- if known
    region text,                   -- e.g. Southwest US, Plains, Northwest Coast
    period_or_era text,            -- e.g. "Early 20th century", "1940s"
    materials text,                -- silver, turquoise, coral, bone, hide
    technique text,                -- stamping, sandcast, beadwork, weaving
    hallmarks text,                -- stamps/marks
    signed boolean,
    certificate_authenticity boolean,
    provenance text,               -- ownership/acquisition history
    dimensions text
);

-- Decorative arts / objets d'art (vases, sculptures, clocks, glassware,
-- porcelain, antiques outside the figurine niche).
create table if not exists public.item_attributes_decorative_arts (
    item_id uuid primary key references public.items(id) on delete cascade,
    period_or_style text,          -- e.g. Art Nouveau, Mid-century, Ming
    origin_country text,
    maker_or_house text,           -- e.g. Tiffany, Baccarat, Steuben
    material text,                 -- crystal, bronze, porcelain, jade
    technique text,                -- cut, blown, cast, hand-painted
    marks text,                    -- factory marks, signatures
    year_or_circa text,
    dimensions text,
    provenance text
);

-- Vintage pipes (briar, meerschaum, clay, calabash, estate pipes)
create table if not exists public.item_attributes_pipes (
    item_id uuid primary key references public.items(id) on delete cascade,
    maker text,                    -- Dunhill, Peterson, Castello, Sasieni
    country_of_origin text,
    shape text,                    -- billiard, bulldog, dublin, calabash
    grade_or_grading text,         -- e.g. "Dunhill Bruyere DR", "Group 4S"
    material text,                 -- briar, meerschaum, clay
    stem_material text,            -- vulcanite, ebonite, lucite, amber
    finish text,                   -- smooth, sandblast, rusticated
    nomenclature text,             -- date stamps / patent codes
    year_made text,
    chamber_diameter text,
    length_inches text,
    estate boolean,                -- pre-owned/restored
    smoked boolean
);

-- Musical instruments
create table if not exists public.item_attributes_musical_instruments (
    item_id uuid primary key references public.items(id) on delete cascade,
    instrument_type text,
    maker text,
    year_made text,
    serial_number text,
    body_material text,
    finish text,
    case_included boolean
);

-- Coins & currency
create table if not exists public.item_attributes_coins_currency (
    item_id uuid primary key references public.items(id) on delete cascade,
    denomination text,
    year text,
    mint_mark text,
    composition text,              -- 90% silver, copper-nickel, gold
    grade text,                    -- e.g. MS-65, VF-30
    grading_service text,          -- PCGS, NGC, ANACS
    certification_number text,
    country text
);

-- Stamps
create table if not exists public.item_attributes_stamps (
    item_id uuid primary key references public.items(id) on delete cascade,
    country text,
    issue_year text,
    scott_number text,
    denomination text,
    condition_grade text,
    perforation text,
    centering text,
    gum_condition text,
    certification text
);

-- Firearms
create table if not exists public.item_attributes_firearms (
    item_id uuid primary key references public.items(id) on delete cascade,
    type text,                     -- rifle, shotgun, pistol, revolver
    caliber_or_gauge text,
    barrel_length text,
    finish text,
    stock_material text,
    year_manufactured text,
    nfa_status text,
    transfer_history text
);

-- Wine & spirits
create table if not exists public.item_attributes_wine_spirits (
    item_id uuid primary key references public.items(id) on delete cascade,
    producer text,
    region text,
    country text,
    vintage text,
    bottle_size text,
    type text,                     -- red, white, sparkling, whisky, etc.
    abv text,
    drink_window text
);

-- ---------------------------------------------------------------------
-- Flexible per-item custom attributes (catch-all for fields the typed
-- schemas don't cover - e.g. "ribbon color", "auction lot #", etc.)
-- ---------------------------------------------------------------------
alter table public.items
    add column if not exists custom_attributes jsonb default '{}'::jsonb;

create index if not exists idx_items_custom_attrs on public.items using gin (custom_attributes);

-- ---------------------------------------------------------------------
-- Richer collections: a default category to pre-fill new items, plus a
-- cover photo for visual collection pages.
-- ---------------------------------------------------------------------
alter table public.collections
    add column if not exists default_category text references public.categories(slug),
    add column if not exists cover_photo_url text,
    add column if not exists notes text;

-- ---------------------------------------------------------------------
-- Enable RLS on the new attribute tables and reuse the same policy
-- pattern as 0001 (read/write only when the parent item belongs to a
-- household the current user is a member of).
-- ---------------------------------------------------------------------
do $$
declare
    t text;
begin
    for t in
        select unnest(array[
            'item_attributes_figurines',
            'item_attributes_ethnographic_art',
            'item_attributes_decorative_arts',
            'item_attributes_pipes',
            'item_attributes_musical_instruments',
            'item_attributes_coins_currency',
            'item_attributes_stamps',
            'item_attributes_firearms',
            'item_attributes_wine_spirits'
        ])
    loop
        execute format('alter table public.%I enable row level security', t);
        execute format('drop policy if exists %1$I_rw on public.%1$I', t);
        execute format(
            'create policy %1$I_rw on public.%1$I for all using (item_id in (select id from public.items where household_id in (select public.user_household_ids()))) with check (item_id in (select id from public.items where household_id in (select public.user_household_ids())))',
            t
        );
    end loop;
end $$;
