-- NEXUS Vrienden: people add each other with a personal friend code or link (/vriend/<code>).
-- Adding sends a request; the other person accepts or declines. Both can end a friendship.
-- Privéberichten and "wie is er online" build on this (public.are_friends). Safe to run again.
--   friend_profiles  your name for friends and your code; only you read your own row
--   friendships      one row per pair: who asked whom, pending or accepted

create table if not exists public.friend_profiles (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 40),
  code text not null unique check (code ~ '^[A-HJ-NP-Z2-9]{8}$'),
  updated_at timestamptz not null default now()
);

create table if not exists public.friendships (
  requester uuid not null references auth.users (id) on delete cascade,
  addressee uuid not null references auth.users (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  primary key (requester, addressee),
  check (requester <> addressee)
);
create index if not exists friendships_addressee on public.friendships (addressee);
-- One row per pair, whoever asked first.
create unique index if not exists friendships_pair on public.friendships (least(requester, addressee), greatest(requester, addressee));

alter table public.friend_profiles enable row level security;
alter table public.friendships enable row level security;

drop policy if exists "You read your own friend profile" on public.friend_profiles;
create policy "You read your own friend profile" on public.friend_profiles
  for select to authenticated using (user_id = (select auth.uid()));
-- Names and codes are written only through set_friend_profile and renew_friend_code below.

drop policy if exists "You see your own friendships" on public.friendships;
create policy "You see your own friendships" on public.friendships
  for select to authenticated using ((select auth.uid()) in (requester, addressee));
drop policy if exists "Either friend ends a friendship" on public.friendships;
create policy "Either friend ends a friendship" on public.friendships
  for delete to authenticated using ((select auth.uid()) in (requester, addressee));
-- Requests and accepting go through request_friend and accept_friend below.

create or replace function public.are_friends(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.friendships
    where status = 'accepted' and least(requester, addressee) = least(a, b) and greatest(requester, addressee) = greatest(a, b)
  );
$$;
revoke all on function public.are_friends(uuid, uuid) from public;
grant execute on function public.are_friends(uuid, uuid) to authenticated;

create or replace function public.new_friend_code()
returns text language plpgsql volatile set search_path = public as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  c text;
begin
  loop
    c := '';
    for i in 1..8 loop
      c := c || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.friend_profiles f where f.code = c);
  end loop;
  return c;
end $$;
revoke all on function public.new_friend_code() from public;

-- Your name for friends; makes your code the first time. Returns your profile.
create or replace function public.set_friend_profile(p_display_name text)
returns public.friend_profiles language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  name text := left(trim(coalesce(p_display_name, '')), 40);
  result public.friend_profiles;
begin
  if me is null then raise exception 'not signed in'; end if;
  if name = '' then raise exception 'name required'; end if;
  insert into public.friend_profiles (user_id, display_name, code) values (me, name, public.new_friend_code())
    on conflict (user_id) do update set display_name = excluded.display_name, updated_at = now()
    returning * into result;
  return result;
end $$;

-- A new code: the old one and its link stop working. Friends you have stay.
create or replace function public.renew_friend_code()
returns public.friend_profiles language plpgsql security definer set search_path = public as $$
declare result public.friend_profiles;
begin
  update public.friend_profiles set code = public.new_friend_code(), updated_at = now() where user_id = auth.uid() returning * into result;
  if result.user_id is null then raise exception 'no friend profile'; end if;
  return result;
end $$;

-- Sends a request to the owner of a code. When they already asked you, you are friends at once.
-- Returns 'pending', 'accepted' or 'already', with their name; null for an unknown code.
create or replace function public.request_friend(p_code text)
returns table (status text, display_name text) language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  them public.friend_profiles;
  existing public.friendships;
begin
  if me is null then raise exception 'not signed in'; end if;
  if not exists (select 1 from public.friend_profiles where user_id = me) then raise exception 'no friend profile'; end if;
  select * into them from public.friend_profiles f where f.code = upper(replace(replace(p_code, '-', ''), ' ', ''));
  if them.user_id is null then return; end if;
  if them.user_id = me then raise exception 'own friend code'; end if;
  select * into existing from public.friendships f
    where least(f.requester, f.addressee) = least(me, them.user_id) and greatest(f.requester, f.addressee) = greatest(me, them.user_id);
  if existing.requester is not null then
    if existing.status = 'pending' and existing.addressee = me then
      update public.friendships f set status = 'accepted', accepted_at = now() where f.requester = existing.requester and f.addressee = me;
      return query select 'accepted'::text, them.display_name;
    else
      return query select (case when existing.status = 'accepted' then 'already' else 'pending' end)::text, them.display_name;
    end if;
    return;
  end if;
  if (select count(*) from public.friendships f where f.requester = me and f.status = 'pending') >= 50 then raise exception 'too many friend requests'; end if;
  if (select count(*) from public.friendships f where me in (f.requester, f.addressee)) >= 300 then raise exception 'too many friends'; end if;
  insert into public.friendships (requester, addressee) values (me, them.user_id);
  return query select 'pending'::text, them.display_name;
end $$;

create or replace function public.accept_friend(p_requester uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.friendships set status = 'accepted', accepted_at = now()
    where requester = p_requester and addressee = auth.uid() and status = 'pending';
  if not found then raise exception 'no friend request'; end if;
end $$;

-- Your friends and requests with their names: 'friend', 'incoming' or 'outgoing'.
create or replace function public.list_friends()
returns table (user_id uuid, display_name text, kind text, since timestamptz) language sql stable security definer set search_path = public as $$
  select other, coalesce(p.display_name, 'Iemand'),
    case when f.status = 'accepted' then 'friend' when f.addressee = auth.uid() then 'incoming' else 'outgoing' end,
    coalesce(f.accepted_at, f.created_at)
  from public.friendships f
  cross join lateral (select case when f.requester = auth.uid() then f.addressee else f.requester end as other) o
  left join public.friend_profiles p on p.user_id = o.other
  where auth.uid() in (f.requester, f.addressee)
  order by 3, 2;
$$;

do $$
declare fn text;
begin
  foreach fn in array array['set_friend_profile(text)', 'renew_friend_code()', 'request_friend(text)', 'accept_friend(uuid)', 'list_friends()'] loop
    execute format('revoke all on function public.%s from public', fn);
    execute format('grant execute on function public.%s to authenticated', fn);
  end loop;
end $$;

-- Live requests in Vrienden (row level security applies).
do $$
begin
  alter publication supabase_realtime add table public.friendships;
exception when duplicate_object then null;
end $$;
