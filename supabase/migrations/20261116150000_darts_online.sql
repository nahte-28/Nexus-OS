-- NEXUS Darts online: play an X01 match against a friend, each on your own device. You invite a
-- friend, they accept, and each of you enters only your own visits; both devices replay the same
-- visits with the rules of the scorer (packages/core/src/dartsOnline.ts). Run after
-- 20261113150000_friends.sql and 20261113240000_admin.sql. Safe to run again.
--   darts_online   one row per match; read by both players (live via Realtime), written only by
--                  the functions below

create table if not exists public.darts_online (
  id uuid primary key default gen_random_uuid(),
  host uuid not null references auth.users (id) on delete cascade,
  guest uuid not null references auth.users (id) on delete cascade,
  host_name text not null check (char_length(host_name) between 1 and 40),
  guest_name text not null check (char_length(guest_name) between 1 and 40),
  mode int not null check (mode between 2 and 1001),
  legs_to_win int not null check (legs_to_win between 1 and 11),
  sets_to_win int not null check (sets_to_win between 1 and 7),
  double_out boolean not null default true,
  status text not null default 'invited' check (status in ('invited', 'playing', 'done', 'declined', 'stopped')),
  -- [{"side": 0|1, "score": 0..180, "darts": 1..3, "doubles": 0..3 (optional)}], in throwing order.
  visits jsonb not null default '[]'::jsonb check (jsonb_typeof(visits) = 'array' and jsonb_array_length(visits) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (host <> guest)
);
create index if not exists darts_online_host on public.darts_online (host, updated_at desc);
create index if not exists darts_online_guest on public.darts_online (guest, updated_at desc);

alter table public.darts_online enable row level security;
revoke insert, update, delete on public.darts_online from anon, authenticated;
drop policy if exists "darts_online read" on public.darts_online;
create policy "darts_online read" on public.darts_online for select to authenticated using (auth.uid() in (host, guest));

-- The side of the caller in a match: 0 for the host, 1 for the guest, null when not in it.
create or replace function public.darts_online_side(p_id uuid)
returns int language sql stable security definer set search_path = public as $$
  select case when host = auth.uid() then 0 when guest = auth.uid() then 1 end from public.darts_online where id = p_id;
$$;
revoke all on function public.darts_online_side(uuid) from public, anon, authenticated;

-- Invites a friend; at most 10 open invites and matches of your own at a time.
create or replace function public.darts_online_invite(p_friend uuid, p_mode int, p_legs int, p_sets int, p_double_out boolean)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  new_id uuid := gen_random_uuid();
begin
  if auth.uid() is null then raise exception 'Niet aangemeld' using errcode = '42501'; end if;
  if not exists (
    select 1 from public.friendships f
    where f.status = 'accepted' and ((f.requester = auth.uid() and f.addressee = p_friend) or (f.addressee = auth.uid() and f.requester = p_friend))
  ) then
    raise exception 'Je kunt alleen een vriend uitnodigen' using errcode = '42501';
  end if;
  if (select count(*) from public.darts_online where auth.uid() in (host, guest) and status in ('invited', 'playing')) >= 10 then
    raise exception 'Je hebt al 10 open online matchen' using errcode = '54000';
  end if;
  insert into public.darts_online (id, host, guest, host_name, guest_name, mode, legs_to_win, sets_to_win, double_out)
  values (new_id, auth.uid(), p_friend, left(public.nexus_display_name(auth.uid()), 40), left(public.nexus_display_name(p_friend), 40), p_mode, p_legs, p_sets, coalesce(p_double_out, true));
  return new_id;
end $$;

-- The friend you invited accepts or declines.
create or replace function public.darts_online_answer(p_id uuid, p_accept boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.darts_online set status = case when p_accept then 'playing' else 'declined' end, updated_at = now()
  where id = p_id and guest = auth.uid() and status = 'invited';
  if not found then raise exception 'Deze uitnodiging is er niet (meer)' using errcode = '42501'; end if;
end $$;

-- Adds your own visit. [p_seq] is how many visits you saw: when the other player threw in the
-- meantime, it no longer matches and nothing changes. Whose turn it is, both devices work out from
-- the visits; a visit out of turn is skipped there.
create or replace function public.darts_online_throw(p_id uuid, p_seq int, p_score int, p_darts int, p_doubles int)
returns int language plpgsql security definer set search_path = public as $$
declare
  side int := public.darts_online_side(p_id);
  visit jsonb;
  n int;
begin
  if side is null then raise exception 'Deze match is er niet (meer)' using errcode = '42501'; end if;
  if p_score is null or p_score < 0 or p_score > 180 or p_darts is null or p_darts < 1 or p_darts > 3 or (p_doubles is not null and (p_doubles < 0 or p_doubles > 3)) then
    raise exception 'Een beurt is 0 tot 180 met 1 tot 3 pijlen' using errcode = '22023';
  end if;
  visit := jsonb_build_object('side', side, 'score', p_score, 'darts', p_darts);
  if p_doubles is not null then visit := visit || jsonb_build_object('doubles', p_doubles); end if;
  update public.darts_online set visits = visits || jsonb_build_array(visit), updated_at = now()
  where id = p_id and status = 'playing' and jsonb_array_length(visits) = p_seq
  returning jsonb_array_length(visits) into n;
  if n is null then raise exception 'De stand is intussen veranderd' using errcode = '40001'; end if;
  return n;
end $$;

-- Takes your own last visit back, as long as nobody threw after it.
create or replace function public.darts_online_undo(p_id uuid, p_seq int)
returns int language plpgsql security definer set search_path = public as $$
declare
  side int := public.darts_online_side(p_id);
  n int;
begin
  if side is null then raise exception 'Deze match is er niet (meer)' using errcode = '42501'; end if;
  update public.darts_online set visits = visits - (jsonb_array_length(visits) - 1), updated_at = now()
  where id = p_id and status = 'playing' and jsonb_array_length(visits) = p_seq and p_seq > 0
    and (visits -> (p_seq - 1) ->> 'side')::int = side
  returning jsonb_array_length(visits) into n;
  if n is null then raise exception 'De stand is intussen veranderd' using errcode = '40001'; end if;
  return n;
end $$;

-- Ends a match: 'done' when someone won it, 'stopped' to stop early or to take back an invite.
create or replace function public.darts_online_end(p_id uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_status not in ('done', 'stopped') then raise exception 'Onbekende afloop' using errcode = '22023'; end if;
  update public.darts_online set status = p_status, updated_at = now()
  where id = p_id and auth.uid() in (host, guest) and (status = 'playing' or (status = 'invited' and p_status = 'stopped'));
end $$;

-- Your matches of the last 30 days and every open one, newest first, with your own side.
create or replace function public.darts_online_list()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', d.id,
    'side', case when d.host = auth.uid() then 0 else 1 end,
    'players', jsonb_build_array(d.host_name, d.guest_name),
    'mode', d.mode,
    'legsToWin', d.legs_to_win,
    'setsToWin', d.sets_to_win,
    'doubleOut', d.double_out,
    'status', d.status,
    'visits', d.visits,
    'createdAt', d.created_at,
    'updatedAt', d.updated_at
  ) order by d.updated_at desc), '[]'::jsonb)
  from (
    select * from public.darts_online
    where auth.uid() in (host, guest) and (status in ('invited', 'playing') or updated_at > now() - interval '30 days')
    order by updated_at desc limit 50
  ) d;
$$;

do $$
declare fn text;
begin
  foreach fn in array array['darts_online_invite(uuid, int, int, int, boolean)', 'darts_online_answer(uuid, boolean)', 'darts_online_throw(uuid, int, int, int, int)', 'darts_online_undo(uuid, int)', 'darts_online_end(uuid, text)', 'darts_online_list()'] loop
    execute format('revoke all on function public.%s from public', fn);
    execute format('grant execute on function public.%s to authenticated', fn);
  end loop;
end $$;

-- Live for both players (row level security applies).
do $$
begin
  alter publication supabase_realtime add table public.darts_online;
exception when duplicate_object then null;
end $$;
