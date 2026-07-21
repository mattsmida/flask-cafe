-- Ember schema — paste this whole file into the Supabase SQL editor and Run.
-- It is idempotent: safe to re-run after edits or on a fresh project.
--
-- Everything hangs off couples/{id}; identity is one anonymous auth user per
-- device (auth.uid()). Two rules that v1 left to the UI are enforced here:
--   * answers: you can read your partner's answer for a day only once your
--     own answer for that day exists (the blind reveal);
--   * letters: nobody — including the author — can read a letter before
--     unlock_at (the vault list uses the metadata-only letter_meta view).

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- tables

create table if not exists couples (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists members (
  couple_id uuid not null references couples (id) on delete cascade,
  uid uuid not null,
  name text not null,
  joined_at timestamptz not null default now(),
  primary key (couple_id, uid)
);

-- One small hot row per member: weather of the heart + web-push subscription.
-- Presence and sparks never touch the database (Realtime presence/broadcast).
create table if not exists statuses (
  couple_id uuid not null references couples (id) on delete cascade,
  uid uuid not null,
  weather text check (weather in ('sunny', 'cloudy', 'stormy')),
  weather_at timestamptz,
  push_subscription jsonb,
  primary key (couple_id, uid)
);

create table if not exists checkins (
  couple_id uuid not null references couples (id) on delete cascade,
  uid uuid not null,
  date date not null,
  energy int not null check (energy between 0 and 100),
  heart int not null check (heart between 0 and 100),
  connection int not null check (connection between 0 and 100),
  word text not null default '',
  at timestamptz not null default now(),
  primary key (couple_id, uid, date)
);

create table if not exists answers (
  couple_id uuid not null references couples (id) on delete cascade,
  uid uuid not null,
  date date not null,
  text text not null,
  at timestamptz not null default now(),
  primary key (couple_id, uid, date)
);

create table if not exists letters (
  couple_id uuid not null references couples (id) on delete cascade,
  uid uuid not null,
  month text not null, -- YYYY-MM
  prompt text not null,
  text text not null,
  written_at timestamptz not null default now(),
  unlock_at timestamptz not null,
  primary key (couple_id, uid, month)
);

-- --------------------------------------------------------------- helpers

-- security definer so RLS policies can consult members/answers without
-- recursing into those tables' own policies.
create or replace function is_member(p_couple uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from members
    where couple_id = p_couple and uid = auth.uid()
  );
$$;

create or replace function has_answered(p_couple uuid, p_date date)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from answers
    where couple_id = p_couple and date = p_date and uid = auth.uid()
  );
$$;

-- ------------------------------------------------------------------ RLS

alter table couples enable row level security;
alter table members enable row level security;
alter table statuses enable row level security;
alter table checkins enable row level security;
alter table answers enable row level security;
alter table letters enable row level security;

-- couples: readable by its members; created only via the create_couple RPC.
drop policy if exists couples_select on couples;
create policy couples_select on couples
  for select to authenticated using (is_member(id));

-- members: readable by fellow members; rows inserted only via the RPCs.
drop policy if exists members_select on members;
create policy members_select on members
  for select to authenticated using (is_member(couple_id));

-- statuses: both can read; you write only your own row.
drop policy if exists statuses_select on statuses;
create policy statuses_select on statuses
  for select to authenticated using (is_member(couple_id));
drop policy if exists statuses_insert on statuses;
create policy statuses_insert on statuses
  for insert to authenticated with check (uid = auth.uid() and is_member(couple_id));
drop policy if exists statuses_update on statuses;
create policy statuses_update on statuses
  for update to authenticated
  using (uid = auth.uid() and is_member(couple_id))
  with check (uid = auth.uid() and is_member(couple_id));

-- checkins: both can read; you upsert only your own.
drop policy if exists checkins_select on checkins;
create policy checkins_select on checkins
  for select to authenticated using (is_member(couple_id));
drop policy if exists checkins_insert on checkins;
create policy checkins_insert on checkins
  for insert to authenticated with check (uid = auth.uid() and is_member(couple_id));
drop policy if exists checkins_update on checkins;
create policy checkins_update on checkins
  for update to authenticated
  using (uid = auth.uid() and is_member(couple_id))
  with check (uid = auth.uid() and is_member(couple_id));

-- answers: the blind reveal, server-side. Your own rows always; your
-- partner's row for a date only once your own row for that date exists.
-- No update/delete policies: sealed once written.
drop policy if exists answers_select on answers;
create policy answers_select on answers
  for select to authenticated
  using (is_member(couple_id) and (uid = auth.uid() or has_answered(couple_id, date)));
drop policy if exists answers_insert on answers;
create policy answers_insert on answers
  for insert to authenticated with check (uid = auth.uid() and is_member(couple_id));

-- letters: sealed from everyone (author included) until unlock_at.
-- No update/delete policies: a sealed letter can't be rewritten.
drop policy if exists letters_select on letters;
create policy letters_select on letters
  for select to authenticated
  using (is_member(couple_id) and unlock_at <= now());
drop policy if exists letters_insert on letters;
create policy letters_insert on letters
  for insert to authenticated with check (uid = auth.uid() and is_member(couple_id));

-- Vault list needs locked letters too (for the countdown), but only their
-- metadata. Owner-rights view bypasses letters RLS; is_member() gates it.
create or replace view letter_meta
  with (security_invoker = false)
as
  select couple_id, uid, month, written_at, unlock_at
  from letters
  where is_member(couple_id);

revoke all on letter_meta from anon;
grant select on letter_meta to authenticated;

-- ----------------------------------------------------------------- RPCs

-- Codes avoid lookalikes (0/O, 1/I/L) so they survive being read over a call.
create or replace function create_couple(p_name text)
returns json
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_code text;
  v_id uuid;
  i int;
begin
  if v_uid is null then
    raise exception 'Not signed in.';
  end if;
  loop
    v_code := '';
    for i in 1..6 loop
      v_code := v_code || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
    end loop;
    begin
      insert into couples (code) values (v_code) returning id into v_id;
      exit;
    exception when unique_violation then
      -- astronomically unlikely; roll a new code
    end;
  end loop;
  insert into members (couple_id, uid, name) values (v_id, v_uid, p_name);
  insert into statuses (couple_id, uid) values (v_id, v_uid);
  return json_build_object('couple_id', v_id, 'code', v_code);
end;
$$;

create or replace function join_couple(p_code text, p_name text)
returns json
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_couple couples%rowtype;
  v_count int;
begin
  if v_uid is null then
    raise exception 'Not signed in.';
  end if;
  select * into v_couple
  from couples
  where code = upper(trim(p_code))
  for update;
  if not found then
    raise exception 'That code doesn''t match any space. Check it and try again.';
  end if;
  if exists (select 1 from members where couple_id = v_couple.id and uid = v_uid) then
    -- already in — rejoining
    return json_build_object('couple_id', v_couple.id, 'code', v_couple.code);
  end if;
  select count(*) into v_count from members where couple_id = v_couple.id;
  if v_count >= 2 then
    raise exception 'That space already has two people in it.';
  end if;
  insert into members (couple_id, uid, name) values (v_couple.id, v_uid, p_name);
  insert into statuses (couple_id, uid) values (v_couple.id, v_uid)
    on conflict do nothing;
  return json_build_object('couple_id', v_couple.id, 'code', v_couple.code);
end;
$$;

revoke execute on function create_couple(text) from public, anon;
revoke execute on function join_couple(text, text) from public, anon;
grant execute on function create_couple(text) to authenticated;
grant execute on function join_couple(text, text) to authenticated;

-- ------------------------------------------------------------- realtime

-- postgres_changes events (RLS-checked per subscriber) for the live tables.
do $$
declare
  t text;
begin
  foreach t in array array['members', 'statuses', 'checkins', 'answers', 'letters'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end;
$$;
