-- =====================================================================
-- Home Inventory Catalog - User Profiles Migration
-- Adds a `profiles` table keyed by auth.users.id so we can render real
-- names / avatars for members instead of opaque UUIDs or raw emails.
-- Also adds the `avatars` storage bucket with RLS that lets each user
-- write inside their own `<user_id>/...` prefix.
-- Idempotent. Safe to run after 0001..0004.
-- =====================================================================

-- ---------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
    id uuid primary key references auth.users(id) on delete cascade,
    display_name text,
    avatar_url text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists idx_profiles_display_name on public.profiles (lower(display_name));

-- Auto-maintain updated_at
create or replace function public.set_profile_updated_at() returns trigger
    language plpgsql as $$
begin
    new.updated_at := now();
    return new;
end;
$$;

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
    before update on public.profiles
    for each row execute function public.set_profile_updated_at();

-- ---------------------------------------------------------------------
-- Trigger: create a profile row whenever a new auth user is created.
-- Seeds display_name from signup metadata (display_name > full_name >
-- name > email prefix) so the Account page is not blank on first load.
-- ---------------------------------------------------------------------
create or replace function public.handle_new_auth_user() returns trigger
    language plpgsql security definer set search_path = public
as $$
declare
    meta_name text;
begin
    meta_name := coalesce(
        nullif(new.raw_user_meta_data ->> 'display_name', ''),
        nullif(new.raw_user_meta_data ->> 'full_name', ''),
        nullif(new.raw_user_meta_data ->> 'name', ''),
        nullif(split_part(new.email, '@', 1), '')
    );

    insert into public.profiles (id, display_name, avatar_url)
    values (
        new.id,
        meta_name,
        nullif(new.raw_user_meta_data ->> 'avatar_url', '')
    )
    on conflict (id) do nothing;
    return new;
end;
$$;

drop trigger if exists trg_auth_user_profile on auth.users;
create trigger trg_auth_user_profile
    after insert on auth.users
    for each row execute function public.handle_new_auth_user();

-- Backfill profiles for any pre-existing users so display looks right
-- immediately after running the migration.
insert into public.profiles (id, display_name, avatar_url)
select
    u.id,
    coalesce(
        nullif(u.raw_user_meta_data ->> 'display_name', ''),
        nullif(u.raw_user_meta_data ->> 'full_name', ''),
        nullif(u.raw_user_meta_data ->> 'name', ''),
        nullif(split_part(u.email, '@', 1), '')
    ),
    nullif(u.raw_user_meta_data ->> 'avatar_url', '')
from auth.users u
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- RLS: users can read/update their own profile. They can also read
-- profiles of anyone in a household they belong to (so Settings can
-- render other members' names/avatars).
-- ---------------------------------------------------------------------
alter table public.profiles enable row level security;

drop policy if exists profiles_select_self_or_member on public.profiles;
create policy profiles_select_self_or_member on public.profiles for select
    using (
        id = auth.uid()
        or id in (
            select user_id from public.household_members
            where household_id in (select public.user_household_ids())
        )
    );

drop policy if exists profiles_insert_self on public.profiles;
create policy profiles_insert_self on public.profiles for insert
    with check (id = auth.uid());

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles for update
    using (id = auth.uid())
    with check (id = auth.uid());

-- ---------------------------------------------------------------------
-- avatars storage bucket
-- Public bucket (so <img src> works without signed URLs). Write access
-- is restricted to the owning user's own prefix: avatars/<user_id>/...
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
    values ('avatars', 'avatars', true)
    on conflict (id) do nothing;

drop policy if exists "avatars public read" on storage.objects;
create policy "avatars public read" on storage.objects for select
    using (bucket_id = 'avatars');

drop policy if exists "avatars owner write" on storage.objects;
create policy "avatars owner write" on storage.objects for insert
    with check (
        bucket_id = 'avatars'
        and (split_part(name, '/', 1))::uuid = auth.uid()
    );

drop policy if exists "avatars owner update" on storage.objects;
create policy "avatars owner update" on storage.objects for update
    using (
        bucket_id = 'avatars'
        and (split_part(name, '/', 1))::uuid = auth.uid()
    );

drop policy if exists "avatars owner delete" on storage.objects;
create policy "avatars owner delete" on storage.objects for delete
    using (
        bucket_id = 'avatars'
        and (split_part(name, '/', 1))::uuid = auth.uid()
    );
