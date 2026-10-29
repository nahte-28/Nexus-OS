-- NEXUS Universal Inbox: what NEXUS reports (flows, updates, deadlines, ...) on every device,
-- with read, archive and snooze. One row per event id, so a retry or a second device never
-- adds it twice. Each user reads and changes only their own rows.
create table if not exists public.inbox_items (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null check (char_length(id) between 1 and 200),
  source text not null check (source in ('flow', 'update', 'device', 'deadline', 'reminder', 'bridge', 'suggestion', 'system', 'study_group')),
  type text not null check (char_length(type) <= 80),
  title text not null check (char_length(title) between 1 and 160),
  body text check (char_length(body) <= 1000),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high')),
  link jsonb check (link is null or (jsonb_typeof(link) = 'object' and pg_column_size(link) <= 500)),
  device_id text check (char_length(device_id) <= 80),
  at bigint not null,
  read_at bigint,
  archived_at bigint,
  snoozed_until bigint,
  updated_at bigint not null,
  synced_at timestamptz not null default now(),
  primary key (user_id, id)
);
create index if not exists inbox_items_user_synced on public.inbox_items (user_id, synced_at);

alter table public.inbox_items enable row level security;

drop policy if exists "Users read their own inbox" on public.inbox_items;
create policy "Users read their own inbox" on public.inbox_items
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "Users add to their own inbox" on public.inbox_items;
create policy "Users add to their own inbox" on public.inbox_items
  for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists "Users change their own inbox" on public.inbox_items;
create policy "Users change their own inbox" on public.inbox_items
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists "Users delete from their own inbox" on public.inbox_items;
create policy "Users delete from their own inbox" on public.inbox_items
  for delete to authenticated using (user_id = (select auth.uid()));

-- A change only lands when it is newer than what is stored (two devices, one item), and every
-- write moves synced_at so other devices pull it. Old items go after 60 days; at most 1000 stay.
create or replace function public.inbox_items_before_write() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.updated_at < old.updated_at then
    return null;
  end if;
  new.synced_at := now();
  return new;
end;
$$;
drop trigger if exists inbox_items_before_write on public.inbox_items;
create trigger inbox_items_before_write before insert or update on public.inbox_items
  for each row execute function public.inbox_items_before_write();

create or replace function public.inbox_items_cleanup() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from public.inbox_items
  where user_id = new.user_id
    and (at < (extract(epoch from now()) * 1000)::bigint - 60::bigint * 86400000
      or id in (select id from public.inbox_items where user_id = new.user_id order by at desc offset 1000));
  return null;
end;
$$;
drop trigger if exists inbox_items_cleanup on public.inbox_items;
create trigger inbox_items_cleanup after insert on public.inbox_items
  for each row execute function public.inbox_items_cleanup();

grant select, insert, update, delete on public.inbox_items to authenticated;
