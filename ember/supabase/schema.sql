-- Ember schema for Supabase.
--
-- Paste this whole file into the Supabase SQL editor and run it. It is
-- idempotent: running it again on an existing project is safe.
--
-- What the row-level security here enforces (server-side, not just in the UI):
--   * every table is only visible to the two members of the couple;
--   * a daily answer stays hidden from your partner until THEIR answer for
--     the same day exists (the blind reveal);
--   * letters are invisible to everyone — including their author — until
--     unlock_at has passed; the letter_vault view exposes only the metadata
--     needed to list sealed letters with countdowns;
--   * answers and letters are immutable once written; check-ins can be
--     re-saved by their owner for the same day.

-- ---------------------------------------------------------------- tables

create table if not exists public.couples (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.members (
  couple_id uuid not null references public.couples(id) on delete cascade,
  uid uuid not null,
  name text not null,
  joined_at timestamptz not null default now(),
  primary key (couple_id, uid)
);

create table if not exists public.statuses (
  couple_id uuid not null references public.couples(id) on delete cascade,
  uid uuid not null,
  weather text check (weather in ('sunny', 'cloudy', 'stormy')),
  weather_at timestamptz,
  push_subscription jsonb,
  primary key (couple_id, uid)
);

create table if not exists public.checkins (
  couple_id uuid not null references public.couples(id) on delete cascade,
  uid uuid not null,
  date date not null,
  energy int not null check (energy between 0 and 100),
  heart int not null check (heart between 0 and 100),
  connection int not null check (connection between 0 and 100),
  word text not null default '',
  at timestamptz not null default now(),
  primary key (couple_id, uid, date)
);

create table if not exists public.answers (
  couple_id uuid not null references public.couples(id) on delete cascade,
  uid uuid not null,
  date date not null,
  text text not null,
  at timestamptz not null default now(),
  primary key (couple_id, uid, date)
);

create table if not exists public.letters (
  couple_id uuid not null references public.couples(id) on delete cascade,
  uid uuid not null,
  month text not null, -- YYYY-MM
  prompt text not null,
  text text not null,
  written_at timestamptz not null default now(),
  unlock_at timestamptz not null,
  primary key (couple_id, uid, month)
);

-- UPDATE events (weather changes, re-saved check-ins) need the full row so
-- Realtime can apply RLS and filters to them.
alter table public.statuses replica identity full;
alter table public.checkins replica identity full;

-- --------------------------------------------------------------- helpers

-- Membership test used by every policy. SECURITY DEFINER so policies on
-- `members` itself can use it without infinite recursion.
create or replace function public.is_member(cid uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from members where couple_id = cid and uid = auth.uid()
  );
$$;

-- "Have I answered on this date?" — used by the blind-reveal policy on
-- `answers`. SECURITY DEFINER to avoid the policy recursing into itself.
create or replace function public.has_answered(cid uuid, d date)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from answers
    where couple_id = cid and date = d and uid = auth.uid()
  );
$$;

revoke execute on function public.is_member(uuid) from public, anon;
revoke execute on function public.has_answered(uuid, date) from public, anon;
grant execute on function public.is_member(uuid) to authenticated;
grant execute on function public.has_answered(uuid, date) to authenticated;

-- ---------------------------------------------------------------- grants

-- The app only ever talks to the database as an authenticated (anonymous
-- sign-in) user; the anon role gets nothing.
revoke all on public.couples, public.members, public.statuses,
  public.checkins, public.answers, public.letters from public, anon;
grant select on public.couples, public.members to authenticated;
grant select, insert, update on public.statuses, public.checkins to authenticated;
grant select, insert on public.answers, public.letters to authenticated;

-- ------------------------------------------------------------------ RLS

alter table public.couples  enable row level security;
alter table public.members  enable row level security;
alter table public.statuses enable row level security;
alter table public.checkins enable row level security;
alter table public.answers  enable row level security;
alter table public.letters  enable row level security;

-- couples: members can read; created only via the create_couple RPC.
drop policy if exists couples_select on public.couples;
create policy couples_select on public.couples
  for select using (public.is_member(id));

-- members: members can see who's in their couple; rows are written only by
-- the create_couple / join_couple RPCs.
drop policy if exists members_select on public.members;
create policy members_select on public.members
  for select using (public.is_member(couple_id));

-- statuses: both members can read; you write only your own row.
drop policy if exists statuses_select on public.statuses;
create policy statuses_select on public.statuses
  for select using (public.is_member(couple_id));
drop policy if exists statuses_insert on public.statuses;
create policy statuses_insert on public.statuses
  for insert with check (uid = auth.uid() and public.is_member(couple_id));
drop policy if exists statuses_update on public.statuses;
create policy statuses_update on public.statuses
  for update using (uid = auth.uid())
  with check (uid = auth.uid() and public.is_member(couple_id));

-- checkins: both members can read; owner can insert and re-save their day.
drop policy if exists checkins_select on public.checkins;
create policy checkins_select on public.checkins
  for select using (public.is_member(couple_id));
drop policy if exists checkins_insert on public.checkins;
create policy checkins_insert on public.checkins
  for insert with check (uid = auth.uid() and public.is_member(couple_id));
drop policy if exists checkins_update on public.checkins;
create policy checkins_update on public.checkins
  for update using (uid = auth.uid())
  with check (uid = auth.uid() and public.is_member(couple_id));

-- answers: the blind reveal. Your own rows are always visible; your
-- partner's row for a date only once your own answer for that date exists.
-- No UPDATE/DELETE policies: sealed means sealed.
drop policy if exists answers_select on public.answers;
create policy answers_select on public.answers
  for select using (
    public.is_member(couple_id)
    and (uid = auth.uid() or public.has_answered(couple_id, date))
  );
drop policy if exists answers_insert on public.answers;
create policy answers_insert on public.answers
  for insert with check (uid = auth.uid() and public.is_member(couple_id));

-- letters: sealed from EVERYONE (author included) until unlock_at.
-- No UPDATE/DELETE policies: letters are immutable.
drop policy if exists letters_select on public.letters;
create policy letters_select on public.letters
  for select using (public.is_member(couple_id) and unlock_at <= now());
drop policy if exists letters_insert on public.letters;
create policy letters_insert on public.letters
  for insert with check (uid = auth.uid() and public.is_member(couple_id));

-- The vault list needs to show sealed letters (whose, which month, countdown)
-- without exposing their text. This view runs with its owner's privileges
-- (security_invoker = off), bypassing the letters SELECT policy, and exposes
-- metadata only — membership is still checked.
create or replace view public.letter_vault
with (security_invoker = off) as
  select couple_id, uid, month, written_at, unlock_at
  from public.letters
  where public.is_member(couple_id);

revoke all on public.letter_vault from public, anon;
grant select on public.letter_vault to authenticated;

-- ----------------------------------------------------------------- RPCs

-- Creates a couple with a fresh invite code and adds the caller as its
-- first member. Returns the new couple's id and code.
create or replace function public.create_couple(p_name text)
returns table (couple_id uuid, code text)
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  -- No lookalike characters (0/O, 1/I/L): codes survive being read aloud.
  v_alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_code text;
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'NOT_SIGNED_IN';
  end if;
  if coalesce(trim(p_name), '') = '' then
    raise exception 'NAME_REQUIRED';
  end if;
  loop
    v_code := '';
    for i in 1..6 loop
      v_code := v_code
        || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
    end loop;
    begin
      insert into couples (code) values (v_code) returning id into v_id;
      exit;
    exception when unique_violation then
      -- astronomically unlikely; roll a new code
    end;
  end loop;
  insert into members (couple_id, uid, name) values (v_id, v_uid, trim(p_name));
  insert into statuses (couple_id, uid) values (v_id, v_uid)
    on conflict do nothing;
  return query select v_id, v_code;
end;
$$;

-- Joins an existing couple by invite code. Enforces the two-person limit
-- atomically (the couple row is locked while the member count is checked).
-- Returns the couple id; rejoining a couple you're already in succeeds.
create or replace function public.join_couple(p_code text, p_name text)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_couple couples%rowtype;
  v_count int;
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
  if exists (
    select 1 from members where couple_id = v_couple.id and uid = v_uid
  ) then
    return v_couple.id; -- already in — rejoining
  end if;
  select count(*) into v_count from members where couple_id = v_couple.id;
  if v_count >= 2 then
    raise exception 'COUPLE_FULL';
  end if;
  insert into members (couple_id, uid, name) values (v_couple.id, v_uid, trim(p_name));
  insert into statuses (couple_id, uid) values (v_couple.id, v_uid)
    on conflict do nothing;
  return v_couple.id;
end;
$$;

revoke execute on function public.create_couple(text) from public, anon;
revoke execute on function public.join_couple(text, text) from public, anon;
grant execute on function public.create_couple(text) to authenticated;
grant execute on function public.join_couple(text, text) to authenticated;

-- ------------------------------------------------------------- realtime

-- Put the live tables on the realtime publication (postgres_changes events
-- are still filtered per-subscriber by the RLS policies above).
do $$
declare
  t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array
      array['members', 'statuses', 'checkins', 'answers', 'letters']
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
