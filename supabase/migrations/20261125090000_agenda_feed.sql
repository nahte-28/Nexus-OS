-- NEXUS Agenda in Google: je lessen (en als je wil je afspraken en deadlines uit NEXUS) als een
-- agenda die Google Agenda via een geheime link leest. Een toestel met NEXUS maakt de .ics-tekst
-- (packages/core/src/agendaFeed.ts) en bewaart ze hier; /api/agenda-feed geeft ze aan Google met de
-- code uit de link. Een nieuwe link maken of stoppen maakt de oude meteen ongeldig.
-- Mag opnieuw lopen. Na 20261124090000_hardening.sql.

create table if not exists public.agenda_feeds (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  token text not null unique check (token ~ '^[A-Za-z0-9_-]{32,64}$'),
  appointments boolean not null default true,
  deadlines boolean not null default false,
  ics text not null default '' check (length(ics) < 2000000),
  updated_at timestamptz not null default now()
);

alter table public.agenda_feeds enable row level security;

drop policy if exists "Users read their own agenda feed" on public.agenda_feeds;
create policy "Users read their own agenda feed" on public.agenda_feeds
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "Users create their own agenda feed" on public.agenda_feeds;
create policy "Users create their own agenda feed" on public.agenda_feeds
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "Users update their own agenda feed" on public.agenda_feeds;
create policy "Users update their own agenda feed" on public.agenda_feeds
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "Users delete their own agenda feed" on public.agenda_feeds;
create policy "Users delete their own agenda feed" on public.agenda_feeds
  for delete to authenticated using ((select auth.uid()) = user_id);

create or replace function public.agenda_feeds_before_write() returns trigger
language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists agenda_feeds_before_write on public.agenda_feeds;
create trigger agenda_feeds_before_write
  before insert or update on public.agenda_feeds
  for each row execute function public.agenda_feeds_before_write();

-- Wat Google Agenda leest: alleen de .ics-tekst bij de geheime code, niets anders. Null als de code
-- niet (meer) bestaat.
create or replace function public.agenda_feed(p_token text) returns text
language sql stable security definer set search_path = public as $$
  select f.ics from public.agenda_feeds f
   where p_token ~ '^[A-Za-z0-9_-]{32,64}$' and f.token = p_token
$$;

revoke execute on function public.agenda_feed(text) from public;
grant execute on function public.agenda_feed(text) to anon, authenticated, service_role;
