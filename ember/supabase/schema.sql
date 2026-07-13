-- Ember schema for Supabase.
--
-- Paste this whole file into the Supabase SQL editor and run it. It is
-- idempotent: running it again on an existing (already-migrated) project is
-- safe. If your project was already running Ember before multi-device
-- support existed, run supabase/migrations/0002_multi_device.sql ONCE
-- first — this file alone will not upgrade an existing "members"-based
-- database (see that file's header for why).
--
-- The core model: a couple has exactly two PERSONS (the actual "member"
-- slots). Each person can have any number of DEVICES linked to them — a
-- device is one browser/install's anonymous auth identity. A device joins
-- a couple as a brand-new person (via the shared invite code) or attaches
-- to an EXISTING person (via that person's own private device-link code,
-- found on their Us tab) — that's how the same person uses Ember from
-- their phone and their desktop as one identity.
--
-- What the row-level security here enforces (server-side, not just in the
-- UI):
--   * every table is only visible to the two people (across all their
--     devices) in the couple;
--   * a daily answer stays hidden from your partner until THEIR answer for
--     the same day exists (the blind reveal) — per person, not per device;
--   * letters are invisible to everyone — including their author — until
--     unlock_at has passed; the letter_vault view exposes only the
--     metadata needed to list sealed letters with countdowns;
--   * answers and letters are immutable once written; check-ins can be
--     re-saved by their owner for the same day;
--   * a device-link code is visible to no one but the person it belongs
--     to — not even their partner.

-- ---------------------------------------------------------------- tables

create table if not exists public.couples (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  created_at timestamptz not null default now()
);

-- The real "member" slots — exactly two per couple, enforced in the
-- create_couple / join_couple RPCs.
create table if not exists public.persons (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

-- One row per signed-in device (browser/install). Many devices can point
-- at the same person. push_subscription lives here, not on the person —
-- each device has its own Web Push endpoint.
create table if not exists public.devices (
  uid uuid primary key,
  person_id uuid not null references public.persons(id) on delete cascade,
  couple_id uuid not null references public.couples(id) on delete cascade,
  push_subscription jsonb,
  linked_at timestamptz not null default now()
);

-- A person's private code for linking additional devices to themselves.
-- Deliberately a separate table from `persons` (rather than a column on
-- it) so it can have its own tight RLS policy without needing column-level
-- security: the couples-wide `persons` row is visible to both partners,
-- but this code must never be.
create table if not exists public.device_link_codes (
  person_id uuid primary key references public.persons(id) on delete cascade,
  code text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.statuses (
  couple_id uuid not null references public.couples(id) on delete cascade,
  person_id uuid not null references public.persons(id) on delete cascade,
  weather text check (weather in ('sunny', 'cloudy', 'stormy')),
  weather_at timestamptz,
  primary key (couple_id, person_id)
);

create table if not exists public.checkins (
  couple_id uuid not null references public.couples(id) on delete cascade,
  person_id uuid not null references public.persons(id) on delete cascade,
  date date not null,
  energy int not null check (energy between 0 and 100),
  heart int not null check (heart between 0 and 100),
  connection int not null check (connection between 0 and 100),
  word text not null default '',
  at timestamptz not null default now(),
  primary key (couple_id, person_id, date)
);

create table if not exists public.answers (
  couple_id uuid not null references public.couples(id) on delete cascade,
  person_id uuid not null references public.persons(id) on delete cascade,
  date date not null,
  text text not null,
  at timestamptz not null default now(),
  primary key (couple_id, person_id, date)
);

create table if not exists public.letters (
  couple_id uuid not null references public.couples(id) on delete cascade,
  person_id uuid not null references public.persons(id) on delete cascade,
  month text not null, -- YYYY-MM
  prompt text not null,
  text text not null,
  written_at timestamptz not null default now(),
  unlock_at timestamptz not null,
  primary key (couple_id, person_id, month)
);

-- UPDATE events (weather changes, re-saved check-ins) need the full row so
-- Realtime can apply RLS and filters to them.
alter table public.statuses replica identity full;
alter table public.checkins replica identity full;

-- --------------------------------------------------------------- helpers

-- Resolves the calling device to the person it's linked to. SECURITY
-- DEFINER so it can read `devices` even though that table grants nothing
-- directly to `authenticated` (it's managed entirely through the RPCs
-- below).
create or replace function public.current_person_id()
returns uuid
language sql stable security definer
set search_path = public
as $$
  select person_id from devices where uid = auth.uid();
$$;

-- Membership test used by every policy: does one of this device's... no,
-- does *a* device belonging to `auth.uid()` belong to this couple.
create or replace function public.is_member(cid uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from devices where couple_id = cid and uid = auth.uid()
  );
$$;

-- "Have I (this person, on any device) answered on this date?" — used by
-- the blind-reveal policy on `answers`.
create or replace function public.has_answered(cid uuid, d date)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from answers
    where couple_id = cid and date = d and person_id = public.current_person_id()
  );
$$;

-- Shared 6-character code generator (invite codes, device-link codes): no
-- lookalike characters (0/O, 1/I/L) so codes survive being read aloud.
create or replace function public.random_code(len int default 6)
returns text
language plpgsql volatile
as $$
declare
  v_alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_code text := '';
begin
  for i in 1..len loop
    v_code := v_code || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
  end loop;
  return v_code;
end;
$$;

revoke execute on function public.current_person_id() from public, anon;
revoke execute on function public.is_member(uuid) from public, anon;
revoke execute on function public.has_answered(uuid, date) from public, anon;
grant execute on function public.current_person_id() to authenticated;
grant execute on function public.is_member(uuid) to authenticated;
grant execute on function public.has_answered(uuid, date) to authenticated;

-- ---------------------------------------------------------------- grants

-- The app only ever talks to the database as an authenticated (anonymous
-- sign-in) user; the anon role gets nothing. `devices` gets no direct
-- grants at all — it's only ever read or written through the SECURITY
-- DEFINER RPCs below.
revoke all on public.couples, public.persons, public.device_link_codes,
  public.statuses, public.checkins, public.answers, public.letters
  from public, anon;
grant select on public.couples, public.persons, public.device_link_codes to authenticated;
grant select, insert, update on public.statuses, public.checkins to authenticated;
grant select, insert on public.answers, public.letters to authenticated;

-- ------------------------------------------------------------------ RLS

alter table public.couples           enable row level security;
alter table public.persons           enable row level security;
alter table public.devices           enable row level security;
alter table public.device_link_codes enable row level security;
alter table public.statuses          enable row level security;
alter table public.checkins          enable row level security;
alter table public.answers           enable row level security;
alter table public.letters           enable row level security;

-- couples: members (any of their devices) can read; created only via the
-- create_couple RPC.
drop policy if exists couples_select on public.couples;
create policy couples_select on public.couples
  for select using (public.is_member(id));

-- persons: both partners can see who's in the space (name, not the device
-- code); rows are written only by the create_couple / join_couple RPCs.
drop policy if exists persons_select on public.persons;
create policy persons_select on public.persons
  for select using (public.is_member(couple_id));

-- devices: no policies at all — combined with no grants above, this table
-- is fully opaque to the client. (RLS is still enabled as defense in depth
-- in case a grant is ever loosened by mistake.)

-- device_link_codes: visible to no one but the person it belongs to — not
-- even their partner. Written only by the RPCs.
drop policy if exists device_link_codes_select on public.device_link_codes;
create policy device_link_codes_select on public.device_link_codes
  for select using (person_id = public.current_person_id());

-- statuses: both partners can read; you write only your own (any device).
drop policy if exists statuses_select on public.statuses;
create policy statuses_select on public.statuses
  for select using (public.is_member(couple_id));
drop policy if exists statuses_insert on public.statuses;
create policy statuses_insert on public.statuses
  for insert with check (person_id = public.current_person_id() and public.is_member(couple_id));
drop policy if exists statuses_update on public.statuses;
create policy statuses_update on public.statuses
  for update using (person_id = public.current_person_id())
  with check (person_id = public.current_person_id() and public.is_member(couple_id));

-- checkins: both partners can read; owner (any device) can insert and
-- re-save their day.
drop policy if exists checkins_select on public.checkins;
create policy checkins_select on public.checkins
  for select using (public.is_member(couple_id));
drop policy if exists checkins_insert on public.checkins;
create policy checkins_insert on public.checkins
  for insert with check (person_id = public.current_person_id() and public.is_member(couple_id));
drop policy if exists checkins_update on public.checkins;
create policy checkins_update on public.checkins
  for update using (person_id = public.current_person_id())
  with check (person_id = public.current_person_id() and public.is_member(couple_id));

-- answers: the blind reveal. Your own rows (any device) are always
-- visible; your partner's row for a date only once your own answer for
-- that date exists. No UPDATE/DELETE policies: sealed means sealed.
drop policy if exists answers_select on public.answers;
create policy answers_select on public.answers
  for select using (
    public.is_member(couple_id)
    and (person_id = public.current_person_id() or public.has_answered(couple_id, date))
  );
drop policy if exists answers_insert on public.answers;
create policy answers_insert on public.answers
  for insert with check (person_id = public.current_person_id() and public.is_member(couple_id));

-- letters: sealed from EVERYONE (author included) until unlock_at.
-- No UPDATE/DELETE policies: letters are immutable.
drop policy if exists letters_select on public.letters;
create policy letters_select on public.letters
  for select using (public.is_member(couple_id) and unlock_at <= now());
drop policy if exists letters_insert on public.letters;
create policy letters_insert on public.letters
  for insert with check (person_id = public.current_person_id() and public.is_member(couple_id));

-- The vault list needs to show sealed letters (whose, which month, countdown)
-- without exposing their text. This view runs with its owner's privileges
-- (security_invoker = off), bypassing the letters SELECT policy, and exposes
-- metadata only — membership is still checked.
create or replace view public.letter_vault
with (security_invoker = off) as
  select couple_id, person_id, month, written_at, unlock_at
  from public.letters
  where public.is_member(couple_id);

revoke all on public.letter_vault from public, anon;
grant select on public.letter_vault to authenticated;

-- ----------------------------------------------------------------- RPCs

-- Creates a couple with a fresh invite code, and the caller's device as
-- its first person. Returns the couple id, the shared partner-invite code,
-- and this device's person id (the client persists this locally — same
-- role AsyncStorage's coupleId already played — so future launches never
-- need to re-derive "who am I" via an extra round trip). The device's
-- private device-link code is deliberately NOT returned here; the Us tab
-- reads it fresh from device_link_codes so a later rotation can't leave a
-- stale cached copy on screen.
-- CREATE OR REPLACE cannot change a function's return shape (relevant when
-- upgrading a project that ran an older Ember schema whose create_couple /
-- join_couple returned a different table shape) — drop first, always.
drop function if exists public.create_couple(text);
drop function if exists public.join_couple(text, text);
drop function if exists public.link_device(text);

create or replace function public.create_couple(p_name text)
-- OUT param names are deliberately NOT "couple_id"/"person_id"/"code":
-- RETURNS TABLE columns become in-scope plpgsql variables, which would
-- shadow (and make ambiguous) any bare column of the same name referenced
-- in the function body.
returns table (out_couple_id uuid, out_code text, out_person_id uuid)
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_code text;
  v_device_code text;
  v_couple_id uuid;
  v_person_id uuid;
begin
  if v_uid is null then
    raise exception 'NOT_SIGNED_IN';
  end if;
  if coalesce(trim(p_name), '') = '' then
    raise exception 'NAME_REQUIRED';
  end if;

  loop
    v_code := public.random_code();
    begin
      insert into couples (code) values (v_code) returning id into v_couple_id;
      exit;
    exception when unique_violation then
      -- astronomically unlikely; roll a new code
    end;
  end loop;

  insert into persons (couple_id, name) values (v_couple_id, trim(p_name))
    returning id into v_person_id;

  loop
    v_device_code := public.random_code();
    begin
      insert into device_link_codes (person_id, code) values (v_person_id, v_device_code);
      exit;
    exception when unique_violation then
    end;
  end loop;

  insert into devices (uid, person_id, couple_id) values (v_uid, v_person_id, v_couple_id);
  insert into statuses (couple_id, person_id) values (v_couple_id, v_person_id)
    on conflict do nothing;

  return query select v_couple_id, v_code, v_person_id;
end;
$$;

-- Joins an existing couple by invite code as a NEW person. Enforces the
-- two-person limit atomically (the couple row is locked while the person
-- count is checked). Rejoining with the same device is idempotent. Returns
-- the couple id and this device's person id.
create or replace function public.join_couple(p_code text, p_name text)
returns table (out_couple_id uuid, out_person_id uuid)
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_couple couples%rowtype;
  v_count int;
  v_person_id uuid;
  v_device_code text;
begin
  if v_uid is null then
    raise exception 'NOT_SIGNED_IN';
  end if;
  if coalesce(trim(p_name), '') = '' then
    raise exception 'NAME_REQUIRED';
  end if;

  select * into v_couple
    from couples
    where couples.code = upper(trim(p_code))
    for update;
  if not found then
    raise exception 'NO_SUCH_CODE';
  end if;

  -- This exact device already belongs to a person in this couple —
  -- rejoining, not a new person.
  select d.person_id into v_person_id
    from devices d where d.uid = v_uid and d.couple_id = v_couple.id;
  if v_person_id is not null then
    return query select v_couple.id, v_person_id;
    return;
  end if;

  select count(*) into v_count from persons where couple_id = v_couple.id;
  if v_count >= 2 then
    raise exception 'COUPLE_FULL';
  end if;

  insert into persons (couple_id, name) values (v_couple.id, trim(p_name))
    returning id into v_person_id;

  loop
    v_device_code := public.random_code();
    begin
      insert into device_link_codes (person_id, code) values (v_person_id, v_device_code);
      exit;
    exception when unique_violation then
    end;
  end loop;

  insert into devices (uid, person_id, couple_id) values (v_uid, v_person_id, v_couple.id);
  insert into statuses (couple_id, person_id) values (v_couple.id, v_person_id)
    on conflict do nothing;

  return query select v_couple.id, v_person_id;
end;
$$;

-- Attaches THIS device to an EXISTING person via their private device-link
-- code — how the same person adds a second (or third...) device. Knowing
-- the code is the only proof required, so it must never be shown to
-- anyone but its owner (enforced by device_link_codes' RLS). Re-linking a
-- device that was already linked elsewhere re-points it — deliberate,
-- since only someone who already holds the code can do it.
create or replace function public.link_device(p_device_code text)
returns table (out_couple_id uuid, out_person_id uuid)
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_person_id uuid;
  v_couple_id uuid;
begin
  if v_uid is null then
    raise exception 'NOT_SIGNED_IN';
  end if;

  select dc.person_id into v_person_id
    from device_link_codes dc
    where dc.code = upper(trim(p_device_code));
  if v_person_id is null then
    raise exception 'NO_SUCH_DEVICE_CODE';
  end if;

  select p.couple_id into v_couple_id from persons p where p.id = v_person_id;

  insert into devices (uid, person_id, couple_id)
    values (v_uid, v_person_id, v_couple_id)
    on conflict (uid) do update
      set person_id = excluded.person_id, couple_id = excluded.couple_id;

  return query select v_couple_id, v_person_id;
end;
$$;

-- Invalidates the caller's current device-link code and issues a new one
-- (e.g. if you're worried it leaked). Existing linked devices are
-- unaffected — only future link_device calls need the new code.
create or replace function public.rotate_device_code()
returns text
language plpgsql security definer
set search_path = public
as $$
declare
  v_person_id uuid := public.current_person_id();
  v_code text;
begin
  if v_person_id is null then
    raise exception 'NOT_LINKED';
  end if;
  loop
    v_code := public.random_code();
    begin
      update device_link_codes set code = v_code where person_id = v_person_id;
      exit;
    exception when unique_violation then
    end;
  end loop;
  return v_code;
end;
$$;

-- Saves this device's Web Push subscription. Routed through an RPC (rather
-- than a grant on `devices`) so that table can stay fully closed to direct
-- client access.
create or replace function public.save_push_subscription(p_subscription jsonb)
returns void
language sql security definer
set search_path = public
as $$
  update devices set push_subscription = p_subscription where uid = auth.uid();
$$;

revoke execute on function public.create_couple(text) from public, anon;
revoke execute on function public.join_couple(text, text) from public, anon;
revoke execute on function public.link_device(text) from public, anon;
revoke execute on function public.rotate_device_code() from public, anon;
revoke execute on function public.save_push_subscription(jsonb) from public, anon;
grant execute on function public.create_couple(text) to authenticated;
grant execute on function public.join_couple(text, text) to authenticated;
grant execute on function public.link_device(text) to authenticated;
grant execute on function public.rotate_device_code() to authenticated;
grant execute on function public.save_push_subscription(jsonb) to authenticated;

-- ------------------------------------------------------------- realtime

-- Put the live tables on the realtime publication (postgres_changes events
-- are still filtered per-subscriber by the RLS policies above). `devices`
-- and `device_link_codes` are deliberately excluded — the client never
-- subscribes to them.
do $$
declare
  t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array
      array['persons', 'statuses', 'checkins', 'answers', 'letters']
    loop
      if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public' and tablename = t
      ) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end;
$$;
