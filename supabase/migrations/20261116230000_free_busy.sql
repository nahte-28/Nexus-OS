-- NEXUS Samen vrij moment zoeken: each NEXUS shares with your friends only when you are busy in the
-- coming two weeks (start and end of each block, never what), so you can look for a moment when you
-- are all free (apps/web/src/friends/freeBusy.ts). Run after 20261113150000_friends.sql and
-- 20261113240000_admin.sql. Safe to run again.
--   free_busy   one row per account: whether you share, and your busy blocks [[start ms, end ms], ...]
-- Read and written only by the functions below.

create table if not exists public.free_busy (
  user_id uuid primary key references auth.users (id) on delete cascade,
  shares boolean not null default true,
  blocks jsonb not null default '[]'::jsonb check (jsonb_typeof(blocks) = 'array' and jsonb_array_length(blocks) <= 500),
  until_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.free_busy enable row level security;
revoke insert, update, delete on public.free_busy from anon, authenticated;
drop policy if exists "free_busy own" on public.free_busy;
create policy "free_busy own" on public.free_busy for select to authenticated using (user_id = auth.uid());

-- Your busy blocks until [p_until]. When you do not share, nothing is kept.
create or replace function public.free_busy_publish(p_blocks jsonb, p_until timestamptz)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Niet aangemeld' using errcode = '42501'; end if;
  if jsonb_typeof(p_blocks) is distinct from 'array' or jsonb_array_length(p_blocks) > 500 then
    raise exception 'Hoogstens 500 blokken' using errcode = '22023';
  end if;
  insert into public.free_busy (user_id, blocks, until_at) values (auth.uid(), p_blocks, p_until)
  on conflict (user_id) do update set
    blocks = case when free_busy.shares then excluded.blocks else '[]'::jsonb end,
    until_at = case when free_busy.shares then excluded.until_at end,
    updated_at = now();
end $$;

-- Turns sharing on or off; off also forgets the blocks.
create or replace function public.free_busy_share(p_shares boolean)
returns void language sql security definer set search_path = public as $$
  insert into public.free_busy (user_id, shares) values (auth.uid(), coalesce(p_shares, false))
  on conflict (user_id) do update set shares = excluded.shares,
    blocks = case when excluded.shares then free_busy.blocks else '[]'::jsonb end,
    until_at = case when excluded.shares then free_busy.until_at end,
    updated_at = now();
$$;

-- Whether you share (true when you never chose).
create or replace function public.free_busy_mine()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('shares', coalesce((select shares from public.free_busy where user_id = auth.uid()), true));
$$;

-- The busy blocks of the friends in [p_friends] (at most 20). Someone who is no friend is left out.
create or replace function public.free_busy_of(p_friends uuid[])
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'user', f.id,
    'name', left(public.nexus_display_name(f.id), 40),
    'shares', coalesce(b.shares, true) and b.user_id is not null,
    'blocks', case when coalesce(b.shares, false) then b.blocks else '[]'::jsonb end,
    'until', case when coalesce(b.shares, false) then b.until_at end,
    'updatedAt', b.updated_at
  )), '[]'::jsonb)
  from (select distinct unnest(p_friends[1:20]) as id) f
  left join public.free_busy b on b.user_id = f.id
  where auth.uid() is not null and exists (
    select 1 from public.friendships s
    where s.status = 'accepted' and ((s.requester = auth.uid() and s.addressee = f.id) or (s.addressee = auth.uid() and s.requester = f.id))
  );
$$;

do $$
declare fn text;
begin
  foreach fn in array array[
    'free_busy_publish(jsonb, timestamptz)',
    'free_busy_share(boolean)',
    'free_busy_mine()',
    'free_busy_of(uuid[])'
  ] loop
    execute format('revoke all on function public.%s from public', fn);
    execute format('grant execute on function public.%s to authenticated', fn);
  end loop;
end $$;
