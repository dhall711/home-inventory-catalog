-- =====================================================================
-- Home Inventory Catalog - Saved Searches Migration
-- Stores per-household, per-user named filter URLs so the sidebar can
-- pin frequently-used views (e.g. "Art > $5k", "Needs review").
-- Idempotent. Safe to run after 0001 + 0002.
-- =====================================================================

create table if not exists public.saved_searches (
    id uuid primary key default gen_random_uuid(),
    household_id uuid not null references public.households(id) on delete cascade,
    created_by uuid not null references auth.users(id) on delete cascade,
    name text not null,
    -- We store the raw query-string of the items page; the sidebar reuses
    -- it verbatim so any new filter we add starts working with no code
    -- change to saved searches.
    query_string text not null,
    icon text,                 -- optional emoji or short label override
    sort_order int not null default 0,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists saved_searches_household_idx
    on public.saved_searches (household_id, sort_order, created_at);

-- updated_at trigger using existing helper if present, otherwise inline.
do $$
begin
    if exists (select 1 from pg_proc where proname = 'set_updated_at') then
        execute 'drop trigger if exists set_updated_at_saved_searches on public.saved_searches';
        execute 'create trigger set_updated_at_saved_searches
            before update on public.saved_searches
            for each row execute function public.set_updated_at()';
    end if;
end $$;

-- ---------------------------------------------------------------------
-- Row level security: same household-scoped pattern as the rest of the
-- schema. Members of the household can read; the creator (or owners)
-- can mutate.
-- ---------------------------------------------------------------------
alter table public.saved_searches enable row level security;

drop policy if exists "saved_searches_select" on public.saved_searches;
create policy "saved_searches_select" on public.saved_searches
    for select using (
        household_id in (
            select household_id from public.household_members
            where user_id = auth.uid()
        )
    );

drop policy if exists "saved_searches_insert" on public.saved_searches;
create policy "saved_searches_insert" on public.saved_searches
    for insert with check (
        household_id in (
            select household_id from public.household_members
            where user_id = auth.uid()
        )
        and created_by = auth.uid()
    );

drop policy if exists "saved_searches_update" on public.saved_searches;
create policy "saved_searches_update" on public.saved_searches
    for update using (
        household_id in (
            select household_id from public.household_members
            where user_id = auth.uid()
        )
        and (
            created_by = auth.uid()
            or exists (
                select 1 from public.household_members
                where household_id = public.saved_searches.household_id
                  and user_id = auth.uid()
                  and role = 'owner'
            )
        )
    );

drop policy if exists "saved_searches_delete" on public.saved_searches;
create policy "saved_searches_delete" on public.saved_searches
    for delete using (
        household_id in (
            select household_id from public.household_members
            where user_id = auth.uid()
        )
        and (
            created_by = auth.uid()
            or exists (
                select 1 from public.household_members
                where household_id = public.saved_searches.household_id
                  and user_id = auth.uid()
                  and role = 'owner'
            )
        )
    );
