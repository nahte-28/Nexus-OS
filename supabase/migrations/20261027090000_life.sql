-- NEXUS Life: deadlines and projects, synced like notes.
-- Each device keeps a local copy and syncs here. Deletions are tombstones (deleted_at),
-- conflicts resolve last-write-wins on the client edit time (updated_at, ms since epoch).

create table if not exists public.life_items (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('deadline', 'project')),
  data jsonb not null check (jsonb_typeof(data) = 'object' and pg_column_size(data) <= 16000),
  updated_at bigint not null,
  deleted_at bigint,
  -- Server time of the last accepted write; clients pull everything newer than their cursor.
  synced_at timestamptz not null default clock_timestamp()
);

create index if not exists life_items_user_synced_at on public.life_items (user_id, synced_at);

alter table public.life_items enable row level security;

create policy "Users read their own life items" on public.life_items
  for select to authenticated using ((select auth.uid()) = user_id);

create policy "Users create their own life items" on public.life_items
  for insert to authenticated with check ((select auth.uid()) = user_id);

create policy "Users update their own life items" on public.life_items
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- No delete policy on purpose: a delete is an update that sets deleted_at.

create or replace function public.life_items_before_write() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if (select count(*) from public.life_items where user_id = new.user_id) >= 5000 then
      raise exception 'Te veel deadlines en projecten.' using errcode = 'check_violation';
    end if;
  else
    -- An older edit arriving late must not overwrite a newer one: skip the update.
    if new.updated_at < old.updated_at then
      return null;
    end if;
    new.user_id := old.user_id;
    new.kind := old.kind;
  end if;
  new.synced_at := clock_timestamp();
  return new;
end;
$$;

drop trigger if exists life_items_before_write on public.life_items;
create trigger life_items_before_write
  before insert or update on public.life_items
  for each row execute function public.life_items_before_write();

-- Lets open devices hear about changes instantly instead of waiting for the next poll.
alter publication supabase_realtime add table public.life_items;
