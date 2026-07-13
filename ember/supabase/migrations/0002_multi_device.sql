-- Multi-device migration for an EXISTING Ember project (one running the
-- original "members"-based schema, before persons/devices existed).
--
-- Run this ONCE in the Supabase SQL editor, THEN paste the current
-- supabase/schema.sql and run that too (it re-declares the steady-state
-- helpers/RLS/RPCs to match this migration's new tables — safe to run
-- repeatedly). Running schema.sql alone, without this file first, will NOT
-- upgrade an existing project: `create table if not exists` is a no-op
-- against tables that already exist under their old column names, so the
-- new RLS policies (which reference columns like `person_id` that don't
-- exist yet) would fail against the untouched old tables.
--
-- This file is idempotent — safe to run more than once. It is
-- non-destructive: the old `members` table is renamed (not dropped) to
-- `members_pre_multidevice_backup`, and the old `uid` columns on
-- statuses/checkins/answers/letters are dropped only after their data has
-- been copied into the new `person_id` columns.
--
-- What it does:
--   1. Creates persons / devices / device_link_codes.
--   2. For every existing member, creates a person (same name), a device
--      (their existing auth uid, carrying over their push_subscription),
--      and a fresh private device-link code.
--   3. Drops the old policies that reference the `uid` column (they'd
--      otherwise block dropping it below).
--   4. Adds `person_id` to statuses/checkins/answers/letters, backfills it
--      from each row's old `uid` via the new devices mapping, then drops
--      the old `uid` column and repoints the primary key.
--   5. Renames `members` out of the way.
--
-- Expect a brief window of errors in the app between running this file and
-- running schema.sql right after it — the old is_member()/RLS policies
-- still reference the old `members` table's shape until schema.sql
-- reinstalls the new ones. Run both back to back.
--
-- After this runs, re-run schema.sql to (re)install the steady-state
-- helpers, RLS policies, RPCs, grants, and realtime publication entries.

-- One-off code generator for this migration only (schema.sql installs the
-- real public.random_code() afterwards; defined first so step 2 below can
-- call it).
create or replace function public_random_code_0002()
returns text
language plpgsql volatile
as $$
declare
  v_alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_code text;
  v_exists boolean;
begin
  loop
    v_code := '';
    for i in 1..6 loop
      v_code := v_code || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
    end loop;
    select exists(select 1 from public.device_link_codes where code = v_code) into v_exists;
    exit when not v_exists;
  end loop;
  return v_code;
end;
$$;

do $$
begin

  -------------------------------------------------------------- step 1
  if not exists (select 1 from information_schema.tables
                 where table_schema='public' and table_name='persons') then
    create table public.persons (
      id uuid primary key default gen_random_uuid(),
      couple_id uuid not null references public.couples(id) on delete cascade,
      name text not null,
      created_at timestamptz not null default now()
    );
  end if;

  if not exists (select 1 from information_schema.tables
                 where table_schema='public' and table_name='devices') then
    create table public.devices (
      uid uuid primary key,
      person_id uuid not null references public.persons(id) on delete cascade,
      couple_id uuid not null references public.couples(id) on delete cascade,
      push_subscription jsonb,
      linked_at timestamptz not null default now()
    );
  end if;

  if not exists (select 1 from information_schema.tables
                 where table_schema='public' and table_name='device_link_codes') then
    create table public.device_link_codes (
      person_id uuid primary key references public.persons(id) on delete cascade,
      code text not null unique,
      created_at timestamptz not null default now()
    );
  end if;

  -------------------------------------------------------------- step 2
  -- Only if the old `members` table still exists AND hasn't been migrated
  -- yet (no devices row for a given old uid means "not migrated").
  if exists (select 1 from information_schema.tables
             where table_schema='public' and table_name='members') then
    insert into public.persons (id, couple_id, name, created_at)
      select gen_random_uuid(), m.couple_id, m.name, m.joined_at
      from public.members m
      where not exists (select 1 from public.devices d where d.uid = m.uid);

    -- One INSERT can't both generate a person id and reference it, so
    -- resolve the mapping by (couple_id, name) — safe here because a
    -- couple's two members always have distinct names in practice, and
    -- this only runs once against pre-migration data.
    insert into public.devices (uid, person_id, couple_id, push_subscription, linked_at)
      select m.uid, p.id, m.couple_id,
             (select s.push_subscription from public.statuses s
              where s.couple_id = m.couple_id and s.uid = m.uid),
             m.joined_at
      from public.members m
      join public.persons p on p.couple_id = m.couple_id and p.name = m.name
      where not exists (select 1 from public.devices d where d.uid = m.uid);

    insert into public.device_link_codes (person_id, code)
      select p.id, public_random_code_0002()
      from public.persons p
      where not exists (select 1 from public.device_link_codes dc where dc.person_id = p.id);
  end if;

end;
$$;

-------------------------------------------------------------------- step 3
-- Old policies reference the `uid` column directly (e.g. `uid =
-- auth.uid()`), and the letter_vault view selects it — Postgres won't let
-- us drop that column below while any of these exist. schema.sql (run
-- right after this file) recreates the correct person_id-based versions.
drop policy if exists statuses_insert on public.statuses;
drop policy if exists statuses_update on public.statuses;
drop policy if exists checkins_insert on public.checkins;
drop policy if exists checkins_update on public.checkins;
drop policy if exists answers_select on public.answers;
drop policy if exists answers_insert on public.answers;
drop policy if exists letters_insert on public.letters;
drop view if exists public.letter_vault;

-------------------------------------------------------------------- step 4
-- Repoint statuses/checkins/answers/letters from uid to person_id.
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema='public' and table_name='statuses' and column_name='uid') then
    alter table public.statuses add column if not exists person_id uuid;
    update public.statuses s set person_id = d.person_id
      from public.devices d where d.uid = s.uid and s.person_id is null;
    alter table public.statuses drop constraint if exists statuses_pkey;
    alter table public.statuses alter column person_id set not null;
    alter table public.statuses add constraint statuses_person_id_fkey
      foreign key (person_id) references public.persons(id) on delete cascade;
    alter table public.statuses add primary key (couple_id, person_id);
    alter table public.statuses drop column uid;
    alter table public.statuses drop column if exists push_subscription; -- moved to devices
  end if;

  if exists (select 1 from information_schema.columns
             where table_schema='public' and table_name='checkins' and column_name='uid') then
    alter table public.checkins add column if not exists person_id uuid;
    update public.checkins c set person_id = d.person_id
      from public.devices d where d.uid = c.uid and c.person_id is null;
    alter table public.checkins drop constraint if exists checkins_pkey;
    alter table public.checkins alter column person_id set not null;
    alter table public.checkins add constraint checkins_person_id_fkey
      foreign key (person_id) references public.persons(id) on delete cascade;
    alter table public.checkins add primary key (couple_id, person_id, date);
    alter table public.checkins drop column uid;
  end if;

  if exists (select 1 from information_schema.columns
             where table_schema='public' and table_name='answers' and column_name='uid') then
    alter table public.answers add column if not exists person_id uuid;
    update public.answers a set person_id = d.person_id
      from public.devices d where d.uid = a.uid and a.person_id is null;
    alter table public.answers drop constraint if exists answers_pkey;
    alter table public.answers alter column person_id set not null;
    alter table public.answers add constraint answers_person_id_fkey
      foreign key (person_id) references public.persons(id) on delete cascade;
    alter table public.answers add primary key (couple_id, person_id, date);
    alter table public.answers drop column uid;
  end if;

  if exists (select 1 from information_schema.columns
             where table_schema='public' and table_name='letters' and column_name='uid') then
    alter table public.letters add column if not exists person_id uuid;
    update public.letters l set person_id = d.person_id
      from public.devices d where d.uid = l.uid and l.person_id is null;
    alter table public.letters drop constraint if exists letters_pkey;
    alter table public.letters alter column person_id set not null;
    alter table public.letters add constraint letters_person_id_fkey
      foreign key (person_id) references public.persons(id) on delete cascade;
    alter table public.letters add primary key (couple_id, person_id, month);
    alter table public.letters drop column uid;
  end if;
end;
$$;

-------------------------------------------------------------------- step 5
do $$
begin
  if exists (select 1 from information_schema.tables
             where table_schema='public' and table_name='members') then
    alter table public.members rename to members_pre_multidevice_backup;
  end if;
end;
$$;

drop function if exists public_random_code_0002();

-- Now run supabase/schema.sql to install the current helpers, RLS
-- policies, RPCs, grants, and realtime publication entries.
