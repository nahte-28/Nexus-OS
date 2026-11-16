-- NEXUS Afspraak met vrienden: you invite friends to one of your appointments; a friend who
-- accepts gets a copy in their own Agenda, and when you change or cancel it, their copy follows
-- (apps/web/src/agenda/invites.ts). Run after 20261113150000_friends.sql and
-- 20261113240000_admin.sql. Safe to run again.
--   appointment_invites   one row per appointment and friend; read by both of them (live via
--                         Realtime), written only by the functions below

create table if not exists public.appointment_invites (
  id uuid primary key default gen_random_uuid(),
  host uuid not null references auth.users (id) on delete cascade,
  guest uuid not null references auth.users (id) on delete cascade,
  host_name text not null check (char_length(host_name) between 1 and 40),
  guest_name text not null check (char_length(guest_name) between 1 and 40),
  -- The id of the appointment in the host's own Agenda.
  host_item uuid not null,
  title text not null check (char_length(title) between 1 and 160),
  start_at timestamptz not null,
  end_at timestamptz not null,
  location text not null default '' check (char_length(location) <= 200),
  notes text not null default '' check (char_length(notes) <= 1000),
  status text not null default 'invited' check (status in ('invited', 'accepted', 'declined', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (host <> guest),
  check (end_at >= start_at),
  unique (host, host_item, guest)
);
create index if not exists appointment_invites_guest on public.appointment_invites (guest, start_at);
create index if not exists appointment_invites_host on public.appointment_invites (host, host_item);

alter table public.appointment_invites enable row level security;
revoke insert, update, delete on public.appointment_invites from anon, authenticated;
drop policy if exists "appointment_invites read" on public.appointment_invites;
create policy "appointment_invites read" on public.appointment_invites for select to authenticated using (auth.uid() in (host, guest));

-- Invites a friend to your appointment [p_item], or invites them again after they declined or
-- you took the invite back. At most 20 friends per appointment and 200 coming invites of yours.
create or replace function public.appointment_invite(p_friend uuid, p_item uuid, p_title text, p_start timestamptz, p_end timestamptz, p_location text, p_notes text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  result uuid;
begin
  if auth.uid() is null then raise exception 'Niet aangemeld' using errcode = '42501'; end if;
  if not exists (
    select 1 from public.friendships f
    where f.status = 'accepted' and ((f.requester = auth.uid() and f.addressee = p_friend) or (f.addressee = auth.uid() and f.requester = p_friend))
  ) then
    raise exception 'Je kunt alleen een vriend uitnodigen' using errcode = '42501';
  end if;
  if coalesce(btrim(p_title), '') = '' or p_start is null or p_end is null or p_end < p_start then
    raise exception 'Een afspraak heeft een titel, een begin en een einde nodig' using errcode = '22023';
  end if;
  if (select count(*) from public.appointment_invites where host = auth.uid() and host_item = p_item and guest <> p_friend) >= 20 then
    raise exception 'Je kunt hoogstens 20 vrienden uitnodigen' using errcode = '54000';
  end if;
  if (select count(*) from public.appointment_invites where host = auth.uid() and end_at > now() and status in ('invited', 'accepted')) >= 200 then
    raise exception 'Je hebt al 200 open uitnodigingen' using errcode = '54000';
  end if;
  insert into public.appointment_invites (host, guest, host_name, guest_name, host_item, title, start_at, end_at, location, notes)
  values (auth.uid(), p_friend, left(public.nexus_display_name(auth.uid()), 40), left(public.nexus_display_name(p_friend), 40), p_item,
    left(btrim(p_title), 160), p_start, p_end, left(coalesce(p_location, ''), 200), left(coalesce(p_notes, ''), 1000))
  on conflict (host, host_item, guest) do update set
    title = excluded.title, start_at = excluded.start_at, end_at = excluded.end_at, location = excluded.location, notes = excluded.notes,
    status = case when appointment_invites.status in ('declined', 'cancelled') then 'invited' else appointment_invites.status end,
    updated_at = now()
  returning id into result;
  return result;
end $$;

-- You changed your appointment: every invite to it takes over the new details. Returns how many.
create or replace function public.appointment_invite_update(p_item uuid, p_title text, p_start timestamptz, p_end timestamptz, p_location text, p_notes text)
returns int language plpgsql security definer set search_path = public as $$
declare
  n int;
begin
  if coalesce(btrim(p_title), '') = '' or p_start is null or p_end is null or p_end < p_start then
    raise exception 'Een afspraak heeft een titel, een begin en een einde nodig' using errcode = '22023';
  end if;
  update public.appointment_invites set title = left(btrim(p_title), 160), start_at = p_start, end_at = p_end,
    location = left(coalesce(p_location, ''), 200), notes = left(coalesce(p_notes, ''), 1000), updated_at = now()
  where host = auth.uid() and host_item = p_item and status <> 'cancelled'
    and (title, start_at, end_at, location, notes) is distinct from (left(btrim(p_title), 160), p_start, p_end, left(coalesce(p_location, ''), 200), left(coalesce(p_notes, ''), 1000));
  get diagnostics n = row_count;
  return n;
end $$;

-- You take the invite back, for one friend or (p_friend null) for everyone, e.g. when you deleted
-- the appointment.
create or replace function public.appointment_invite_cancel(p_item uuid, p_friend uuid)
returns int language plpgsql security definer set search_path = public as $$
declare
  n int;
begin
  update public.appointment_invites set status = 'cancelled', updated_at = now()
  where host = auth.uid() and host_item = p_item and (p_friend is null or guest = p_friend) and status <> 'cancelled';
  get diagnostics n = row_count;
  return n;
end $$;

-- The friend you invited accepts or declines; declining also works after accepting.
create or replace function public.appointment_invite_answer(p_id uuid, p_accept boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.appointment_invites set status = case when p_accept then 'accepted' else 'declined' end, updated_at = now()
  where id = p_id and guest = auth.uid() and status <> 'cancelled';
  if not found then raise exception 'Deze uitnodiging is er niet (meer)' using errcode = '42501'; end if;
end $$;

-- Invites you sent and got, for appointments that end at most 30 days ago, by start.
create or replace function public.appointment_invites_list()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', i.id,
    'side', case when i.host = auth.uid() then 'host' else 'guest' end,
    'hostItem', i.host_item,
    'other', case when i.host = auth.uid() then i.guest else i.host end,
    'otherName', case when i.host = auth.uid() then i.guest_name else i.host_name end,
    'title', i.title,
    'startAt', i.start_at,
    'endAt', i.end_at,
    'location', i.location,
    'notes', i.notes,
    'status', i.status,
    'updatedAt', i.updated_at
  ) order by i.start_at), '[]'::jsonb)
  from (
    select * from public.appointment_invites
    where auth.uid() in (host, guest) and end_at > now() - interval '30 days'
    order by start_at limit 500
  ) i;
$$;

do $$
declare fn text;
begin
  foreach fn in array array[
    'appointment_invite(uuid, uuid, text, timestamptz, timestamptz, text, text)',
    'appointment_invite_update(uuid, text, timestamptz, timestamptz, text, text)',
    'appointment_invite_cancel(uuid, uuid)',
    'appointment_invite_answer(uuid, boolean)',
    'appointment_invites_list()'
  ] loop
    execute format('revoke all on function public.%s from public', fn);
    execute format('grant execute on function public.%s to authenticated', fn);
  end loop;
end $$;

-- Live for both of them (row level security applies).
do $$
begin
  alter publication supabase_realtime add table public.appointment_invites;
exception when duplicate_object then null;
end $$;
