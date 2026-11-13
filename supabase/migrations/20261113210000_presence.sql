-- NEXUS Wie is er online: your friends and the people in your teams see whether you have NEXUS
-- open, and an optional short status. Run after 20261028140000_study_groups.sql and
-- 20261113150000_friends.sql. Only the last time NEXUS was open is kept, no history. Safe to run again.
--   user_presence   one row per person; only you read and write your own row

create table if not exists public.user_presence (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  state text not null default 'available' check (state in ('available', 'busy', 'invisible')),
  note text check (note is null or char_length(note) between 1 and 60),
  last_seen timestamptz not null default now()
);

alter table public.user_presence enable row level security;
revoke insert, update, delete on public.user_presence from anon, authenticated;
drop policy if exists "You read your own presence" on public.user_presence;
create policy "You read your own presence" on public.user_presence
  for select to authenticated using (user_id = (select auth.uid()));

-- NEXUS is open on one of your devices: refreshes the moment, at most every 20 seconds.
create or replace function public.presence_ping()
returns void language sql security definer set search_path = public as $$
  insert into public.user_presence (user_id, last_seen) values (auth.uid(), now())
  on conflict (user_id) do update set last_seen = now()
    where public.user_presence.last_seen < now() - interval '20 seconds';
$$;

-- Your status for everyone who may see it: available, busy or invisible, with an optional note.
create or replace function public.set_presence(p_state text, p_note text)
returns void language sql security definer set search_path = public as $$
  insert into public.user_presence (user_id, state, note, last_seen)
  values (auth.uid(), p_state, nullif(left(btrim(coalesce(p_note, '')), 60), ''), now())
  on conflict (user_id) do update set state = excluded.state, note = excluded.note, last_seen = now();
$$;

-- Your friends and the people you share a team with. Someone invisible looks offline; the time
-- is rounded down to the minute.
create or replace function public.presence_list()
returns table (user_id uuid, state text, note text, last_seen timestamptz) language sql stable security definer set search_path = public as $$
  with people as (
    select case when f.requester = auth.uid() then f.addressee else f.requester end as id
    from public.friendships f
    where f.status = 'accepted' and auth.uid() in (f.requester, f.addressee)
    union
    select other.user_id
    from public.study_group_members mine
    join public.study_group_members other on other.group_id = mine.group_id
    where mine.user_id = auth.uid()
  )
  select p.id,
    case when u.state is null or u.state = 'invisible' then 'offline' else u.state end,
    case when u.state = 'invisible' then null else u.note end,
    case when u.state = 'invisible' then null else date_trunc('minute', u.last_seen) end
  from people p
  left join public.user_presence u on u.user_id = p.id
  where p.id <> auth.uid();
$$;

do $$
declare fn text;
begin
  foreach fn in array array['presence_ping()', 'set_presence(text, text)', 'presence_list()'] loop
    execute format('revoke all on function public.%s from public', fn);
    execute format('grant execute on function public.%s to authenticated', fn);
  end loop;
end $$;
