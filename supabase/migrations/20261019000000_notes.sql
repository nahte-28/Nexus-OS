-- NEXUS OS v0.3: synced notes.
-- Each device keeps a local copy and syncs here. Deletions are tombstones (deleted_at),
-- conflicts resolve last-write-wins on the client edit time (updated_at, ms since epoch).

create table if not exists public.notes (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null default '',
  body text not null default '',
  updated_at bigint not null,
  deleted_at bigint,
  -- Server time of the last accepted write; clients pull everything newer than their cursor.
  synced_at timestamptz not null default clock_timestamp()
);

create index if not exists notes_user_synced_at on public.notes (user_id, synced_at);

alter table public.notes enable row level security;

create policy "Users read their own notes" on public.notes
  for select to authenticated using ((select auth.uid()) = user_id);

create policy "Users create their own notes" on public.notes
  for insert to authenticated with check ((select auth.uid()) = user_id);

create policy "Users update their own notes" on public.notes
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- No delete policy on purpose: a delete is an update that sets deleted_at.

create or replace function public.notes_before_write() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' then
    -- An older edit arriving late must not overwrite a newer one: skip the update.
    if new.updated_at < old.updated_at then
      return null;
    end if;
    new.user_id := old.user_id;
  end if;
  new.synced_at := clock_timestamp();
  return new;
end;
$$;

drop trigger if exists notes_before_write on public.notes;
create trigger notes_before_write
  before insert or update on public.notes
  for each row execute function public.notes_before_write();

-- Lets open devices hear about changes instantly instead of waiting for the next poll.
alter publication supabase_realtime add table public.notes;
