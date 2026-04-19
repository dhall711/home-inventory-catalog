-- =====================================================================
-- Home Inventory Catalog - Initial Schema
-- Run inside the Supabase SQL editor (or `supabase db push` via CLI).
-- Idempotent where reasonable.
-- =====================================================================

create extension if not exists "pgcrypto";
create extension if not exists "pg_trgm";

-- ---------------------------------------------------------------------
-- Households + members
-- ---------------------------------------------------------------------
create table if not exists public.households (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    currency text not null default 'USD',
    created_at timestamptz not null default now()
);

create type public.member_role as enum ('owner', 'member');

create table if not exists public.household_members (
    household_id uuid not null references public.households(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    role public.member_role not null default 'member',
    invited_email text,
    joined_at timestamptz not null default now(),
    primary key (household_id, user_id)
);

create index if not exists idx_household_members_user on public.household_members(user_id);

-- Pending invites (member rows are created at acceptance time)
create table if not exists public.household_invites (
    id uuid primary key default gen_random_uuid(),
    household_id uuid not null references public.households(id) on delete cascade,
    email text not null,
    role public.member_role not null default 'member',
    invited_by uuid not null references auth.users(id) on delete cascade,
    token text not null unique default encode(gen_random_bytes(24), 'hex'),
    accepted_at timestamptz,
    created_at timestamptz not null default now()
);

create index if not exists idx_household_invites_email on public.household_invites(lower(email));

-- ---------------------------------------------------------------------
-- Categories (seeded global lookup)
-- ---------------------------------------------------------------------
create table if not exists public.categories (
    slug text primary key,
    name text not null,
    sort_order int not null default 0
);

insert into public.categories (slug, name, sort_order) values
    ('art', 'Art', 10),
    ('furniture', 'Furniture', 20),
    ('electronics', 'Electronics', 30),
    ('appliances', 'Appliances', 40),
    ('jewelry', 'Jewelry', 50),
    ('watches', 'Watches', 60),
    ('collectibles', 'Collectibles', 70),
    ('apparel', 'Apparel', 80),
    ('tools', 'Tools', 90),
    ('kitchenware', 'Kitchenware', 100),
    ('books_media', 'Books & Media', 110),
    ('sporting', 'Sporting Goods', 120),
    ('other', 'Other', 999)
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------
-- Locations (hierarchical: House > Room > Container)
-- ---------------------------------------------------------------------
create table if not exists public.locations (
    id uuid primary key default gen_random_uuid(),
    household_id uuid not null references public.households(id) on delete cascade,
    parent_id uuid references public.locations(id) on delete set null,
    name text not null,
    created_at timestamptz not null default now()
);

create index if not exists idx_locations_household on public.locations(household_id);
create index if not exists idx_locations_parent on public.locations(parent_id);

-- ---------------------------------------------------------------------
-- Collections (e.g., "Estate Jewelry", "Vintage Cameras")
-- ---------------------------------------------------------------------
create table if not exists public.collections (
    id uuid primary key default gen_random_uuid(),
    household_id uuid not null references public.households(id) on delete cascade,
    name text not null,
    description text,
    created_at timestamptz not null default now()
);

create index if not exists idx_collections_household on public.collections(household_id);

-- ---------------------------------------------------------------------
-- Tags
-- ---------------------------------------------------------------------
create table if not exists public.tags (
    id uuid primary key default gen_random_uuid(),
    household_id uuid not null references public.households(id) on delete cascade,
    name text not null,
    created_at timestamptz not null default now(),
    unique (household_id, name)
);

create index if not exists idx_tags_household on public.tags(household_id);

-- ---------------------------------------------------------------------
-- Items (core record)
-- ---------------------------------------------------------------------
create type public.item_status as enum ('active', 'sold', 'disposed', 'lost', 'review');
create type public.value_source as enum ('manual', 'ai', 'appraisal', 'receipt');

create table if not exists public.items (
    id uuid primary key default gen_random_uuid(),
    household_id uuid not null references public.households(id) on delete cascade,
    category text not null references public.categories(slug),
    name text not null,
    description text,
    manufacturer text,
    model text,
    serial_number text,
    condition text,
    status public.item_status not null default 'active',

    location_id uuid references public.locations(id) on delete set null,
    collection_id uuid references public.collections(id) on delete set null,

    acquired_date date,
    acquired_from text,
    acquired_price numeric(14,2),

    current_value numeric(14,2),
    current_value_source public.value_source,
    current_value_updated_at timestamptz,

    primary_photo_url text,
    primary_photo_thumb_url text,

    notes text,

    ai_confidence numeric(4,3),
    ai_raw_json jsonb,

    -- Lightweight FTS column maintained by trigger below
    search_text tsvector,

    created_by uuid references auth.users(id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists idx_items_household_category on public.items(household_id, category);
create index if not exists idx_items_household_location on public.items(household_id, location_id);
create index if not exists idx_items_household_collection on public.items(household_id, collection_id);
create index if not exists idx_items_household_updated on public.items(household_id, updated_at desc);
create index if not exists idx_items_household_status on public.items(household_id, status);
create index if not exists idx_items_search on public.items using gin(search_text);
create index if not exists idx_items_serial on public.items(household_id, lower(serial_number));

create or replace function public.items_search_text_trigger() returns trigger as $$
begin
    new.search_text :=
        setweight(to_tsvector('simple', coalesce(new.name, '')), 'A') ||
        setweight(to_tsvector('simple', coalesce(new.manufacturer, '')), 'B') ||
        setweight(to_tsvector('simple', coalesce(new.model, '')), 'B') ||
        setweight(to_tsvector('simple', coalesce(new.serial_number, '')), 'B') ||
        setweight(to_tsvector('simple', coalesce(new.description, '')), 'C') ||
        setweight(to_tsvector('simple', coalesce(new.notes, '')), 'D');
    new.updated_at := now();
    return new;
end;
$$ language plpgsql;

drop trigger if exists trg_items_search_text on public.items;
create trigger trg_items_search_text
    before insert or update on public.items
    for each row execute function public.items_search_text_trigger();

-- ---------------------------------------------------------------------
-- Per-category attribute tables (1-to-1 with items)
-- ---------------------------------------------------------------------
create table if not exists public.item_attributes_art (
    item_id uuid primary key references public.items(id) on delete cascade,
    artist text,
    medium text,
    dimensions text,
    year_created text,
    signed boolean,
    edition text,
    provenance text,
    framed boolean
);

create table if not exists public.item_attributes_electronics (
    item_id uuid primary key references public.items(id) on delete cascade,
    mac_address text,
    imei text,
    firmware text,
    warranty_until date,
    accessories text
);

create table if not exists public.item_attributes_jewelry (
    item_id uuid primary key references public.items(id) on delete cascade,
    metal text,
    karat text,
    stones text,
    carat_weight text,
    hallmarks text,
    appraisal_date date
);

create table if not exists public.item_attributes_furniture (
    item_id uuid primary key references public.items(id) on delete cascade,
    material text,
    dimensions_w_d_h text,
    designer text,
    style_period text
);

create table if not exists public.item_attributes_watches (
    item_id uuid primary key references public.items(id) on delete cascade,
    movement text,
    case_material text,
    case_size text,
    band_material text,
    reference_number text,
    box_papers boolean
);

create table if not exists public.item_attributes_collectibles (
    item_id uuid primary key references public.items(id) on delete cascade,
    edition text,
    grade text,
    certification text,
    rarity text
);

-- ---------------------------------------------------------------------
-- Item join tables
-- ---------------------------------------------------------------------
create table if not exists public.item_tags (
    item_id uuid not null references public.items(id) on delete cascade,
    tag_id uuid not null references public.tags(id) on delete cascade,
    primary key (item_id, tag_id)
);

create index if not exists idx_item_tags_tag on public.item_tags(tag_id);

-- ---------------------------------------------------------------------
-- Item photos
-- ---------------------------------------------------------------------
create table if not exists public.item_photos (
    id uuid primary key default gen_random_uuid(),
    item_id uuid not null references public.items(id) on delete cascade,
    url text not null,
    thumb_url text,
    is_primary boolean not null default false,
    sort_order int not null default 0,
    source_batch_id uuid,
    bbox_json jsonb,
    created_at timestamptz not null default now()
);

create index if not exists idx_item_photos_item on public.item_photos(item_id);
create index if not exists idx_item_photos_batch on public.item_photos(source_batch_id);

-- ---------------------------------------------------------------------
-- Item attachments (receipts, appraisals, manuals)
-- ---------------------------------------------------------------------
create type public.attachment_kind as enum ('receipt', 'appraisal', 'manual', 'other');

create table if not exists public.item_attachments (
    id uuid primary key default gen_random_uuid(),
    item_id uuid not null references public.items(id) on delete cascade,
    kind public.attachment_kind not null,
    url text not null,
    filename text,
    size_bytes int,
    uploaded_by uuid references auth.users(id) on delete set null,
    uploaded_at timestamptz not null default now()
);

create index if not exists idx_item_attachments_item on public.item_attachments(item_id);

-- ---------------------------------------------------------------------
-- Value history
-- ---------------------------------------------------------------------
create table if not exists public.value_history (
    id uuid primary key default gen_random_uuid(),
    item_id uuid not null references public.items(id) on delete cascade,
    value numeric(14,2) not null,
    source public.value_source not null,
    dated_on date not null default current_date,
    notes text,
    created_at timestamptz not null default now()
);

create index if not exists idx_value_history_item_date on public.value_history(item_id, dated_on desc);

-- ---------------------------------------------------------------------
-- Batch uploads (one room/shelf photo, many detected items)
-- ---------------------------------------------------------------------
create type public.batch_status as enum ('pending', 'analyzing', 'review', 'complete', 'error');

create table if not exists public.batch_uploads (
    id uuid primary key default gen_random_uuid(),
    household_id uuid not null references public.households(id) on delete cascade,
    source_image_url text not null,
    status public.batch_status not null default 'pending',
    detected_count int not null default 0,
    notes text,
    created_by uuid references auth.users(id) on delete set null,
    created_at timestamptz not null default now()
);

create index if not exists idx_batch_uploads_household on public.batch_uploads(household_id, created_at desc);

-- ---------------------------------------------------------------------
-- Saved reports
-- ---------------------------------------------------------------------
create table if not exists public.reports (
    id uuid primary key default gen_random_uuid(),
    household_id uuid not null references public.households(id) on delete cascade,
    name text not null,
    filters_json jsonb not null,
    item_count int not null,
    total_value numeric(14,2) not null,
    pdf_url text,
    csv_url text,
    created_by uuid references auth.users(id) on delete set null,
    created_at timestamptz not null default now()
);

create index if not exists idx_reports_household on public.reports(household_id, created_at desc);

-- ---------------------------------------------------------------------
-- Helper: returns household_ids the current user belongs to
-- ---------------------------------------------------------------------
create or replace function public.user_household_ids() returns setof uuid
    language sql stable security definer set search_path = public
as $$
    select household_id from public.household_members where user_id = auth.uid();
$$;

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.household_invites enable row level security;
alter table public.locations enable row level security;
alter table public.collections enable row level security;
alter table public.tags enable row level security;
alter table public.items enable row level security;
alter table public.item_tags enable row level security;
alter table public.item_photos enable row level security;
alter table public.item_attachments enable row level security;
alter table public.value_history enable row level security;
alter table public.batch_uploads enable row level security;
alter table public.reports enable row level security;
alter table public.item_attributes_art enable row level security;
alter table public.item_attributes_electronics enable row level security;
alter table public.item_attributes_jewelry enable row level security;
alter table public.item_attributes_furniture enable row level security;
alter table public.item_attributes_watches enable row level security;
alter table public.item_attributes_collectibles enable row level security;

-- Generic policy generator macro: select/insert/update/delete only when
-- the row's household_id is in the user's household set.

-- households
drop policy if exists households_select on public.households;
create policy households_select on public.households for select
    using (id in (select public.user_household_ids()));

drop policy if exists households_insert on public.households;
create policy households_insert on public.households for insert
    with check (auth.uid() is not null);

drop policy if exists households_update on public.households;
create policy households_update on public.households for update
    using (id in (select public.user_household_ids()));

-- household_members
drop policy if exists hm_select on public.household_members;
create policy hm_select on public.household_members for select
    using (household_id in (select public.user_household_ids()) or user_id = auth.uid());

drop policy if exists hm_insert on public.household_members;
create policy hm_insert on public.household_members for insert
    with check (
        user_id = auth.uid() -- self-join via accepted invite
        or household_id in (
            select household_id from public.household_members
            where user_id = auth.uid() and role = 'owner'
        )
    );

drop policy if exists hm_delete on public.household_members;
create policy hm_delete on public.household_members for delete
    using (
        user_id = auth.uid()
        or household_id in (
            select household_id from public.household_members
            where user_id = auth.uid() and role = 'owner'
        )
    );

-- household_invites - only owners can manage
drop policy if exists hi_select on public.household_invites;
create policy hi_select on public.household_invites for select
    using (
        household_id in (
            select household_id from public.household_members
            where user_id = auth.uid() and role = 'owner'
        )
        or lower(email) = lower(coalesce((auth.jwt() ->> 'email'), ''))
    );

drop policy if exists hi_insert on public.household_invites;
create policy hi_insert on public.household_invites for insert
    with check (
        household_id in (
            select household_id from public.household_members
            where user_id = auth.uid() and role = 'owner'
        )
    );

drop policy if exists hi_update on public.household_invites;
create policy hi_update on public.household_invites for update
    using (
        household_id in (
            select household_id from public.household_members
            where user_id = auth.uid() and role = 'owner'
        )
        or lower(email) = lower(coalesce((auth.jwt() ->> 'email'), ''))
    );

-- Reusable household-scoped policies
do $$
declare
    t text;
begin
    for t in
        select unnest(array[
            'locations','collections','tags','items','batch_uploads','reports'
        ])
    loop
        execute format('drop policy if exists %1$I_rw on public.%1$I', t);
        execute format(
            'create policy %1$I_rw on public.%1$I for all using (household_id in (select public.user_household_ids())) with check (household_id in (select public.user_household_ids()))',
            t
        );
    end loop;
end $$;

-- Item-children policies (no direct household_id; check via parent item)
do $$
declare
    t text;
begin
    for t in
        select unnest(array[
            'item_tags','item_photos','item_attachments','value_history',
            'item_attributes_art','item_attributes_electronics','item_attributes_jewelry',
            'item_attributes_furniture','item_attributes_watches','item_attributes_collectibles'
        ])
    loop
        execute format('drop policy if exists %1$I_rw on public.%1$I', t);
        execute format(
            'create policy %1$I_rw on public.%1$I for all using (item_id in (select id from public.items where household_id in (select public.user_household_ids()))) with check (item_id in (select id from public.items where household_id in (select public.user_household_ids())))',
            t
        );
    end loop;
end $$;

-- Categories table is read-only public
drop policy if exists categories_select on public.categories;
alter table public.categories enable row level security;
create policy categories_select on public.categories for select using (true);

-- ---------------------------------------------------------------------
-- Storage buckets (run once; safe to re-run)
-- Buckets are private; signed URLs / authenticated reads via app.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
    values ('item-photos', 'item-photos', true)
    on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
    values ('item-attachments', 'item-attachments', false)
    on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
    values ('reports', 'reports', false)
    on conflict (id) do nothing;

-- Storage RLS: allow authenticated users to manage their own household
-- objects. Object paths use the convention: <household_id>/<...>/file.
drop policy if exists "household objects read" on storage.objects;
create policy "household objects read" on storage.objects for select
    using (
        bucket_id in ('item-photos','item-attachments','reports')
        and (
            bucket_id = 'item-photos' -- public bucket
            or (split_part(name, '/', 1))::uuid in (select public.user_household_ids())
        )
    );

drop policy if exists "household objects write" on storage.objects;
create policy "household objects write" on storage.objects for insert
    with check (
        bucket_id in ('item-photos','item-attachments','reports')
        and (split_part(name, '/', 1))::uuid in (select public.user_household_ids())
    );

drop policy if exists "household objects update" on storage.objects;
create policy "household objects update" on storage.objects for update
    using (
        bucket_id in ('item-photos','item-attachments','reports')
        and (split_part(name, '/', 1))::uuid in (select public.user_household_ids())
    );

drop policy if exists "household objects delete" on storage.objects;
create policy "household objects delete" on storage.objects for delete
    using (
        bucket_id in ('item-photos','item-attachments','reports')
        and (split_part(name, '/', 1))::uuid in (select public.user_household_ids())
    );
