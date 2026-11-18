-- NEXUS Verjaardagen: your NEXUS shares the day and month of your birthday (from Over jou, never
-- the year). On your birthday NEXUS itself sends you a message "Gelukkige verjaardag", in Vrienden ›
-- Berichten and as a notice on your phone; your friends see that you are jarig and get a notice
-- too. You can stop showing it to friends in Over jou. Beheer sees every birthday.
-- Run after 20261113150000_friends.sql, 20261113240000_admin.sql and
-- 20261116090000_message_push.sql. Safe to run again.
--   birthdays        one row per account: MM-DD and whether friends see it
--   system_messages  messages from NEXUS itself to one account, written only by the database

create table if not exists public.birthdays (
  user_id uuid primary key references auth.users (id) on delete cascade,
  month_day text not null check (month_day ~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'),
  shares boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table public.birthdays enable row level security;
revoke insert, update, delete on public.birthdays from anon, authenticated;
drop policy if exists "birthdays own" on public.birthdays;
create policy "birthdays own" on public.birthdays for select to authenticated using (user_id = (select auth.uid()));

create table if not exists public.system_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- What the message is about, once per account: birthday:2026, friend-birthday:<id>:2026.
  ref text not null check (char_length(ref) <= 120),
  kind text not null check (kind in ('birthday', 'friend_birthday')),
  title text not null check (char_length(title) <= 120),
  body text not null check (char_length(body) <= 500),
  -- The friend a friend_birthday is about, so Berichten can open the conversation.
  about_user uuid references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  unique (user_id, ref)
);
create index if not exists system_messages_user on public.system_messages (user_id, created_at desc);
alter table public.system_messages enable row level security;
revoke insert, update on public.system_messages from anon, authenticated;
drop policy if exists "system_messages own" on public.system_messages;
create policy "system_messages own" on public.system_messages for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "system_messages delete own" on public.system_messages;
create policy "system_messages delete own" on public.system_messages for delete to authenticated using (user_id = (select auth.uid()));

-- Your birthday as MM-DD, or null to forget it, and whether friends see it.
create or replace function public.set_birthday(p_month_day text, p_shares boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Niet aangemeld' using errcode = '42501'; end if;
  if p_month_day is null or p_month_day = '' then
    delete from public.birthdays where user_id = auth.uid();
    return;
  end if;
  if p_month_day !~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$' then
    raise exception 'Geen geldige verjaardag' using errcode = '22023';
  end if;
  insert into public.birthdays (user_id, month_day, shares) values (auth.uid(), p_month_day, coalesce(p_shares, true))
  on conflict (user_id) do update set month_day = excluded.month_day, shares = excluded.shares, updated_at = now();
end $$;

-- The birthdays of your friends who share theirs: [{user, name, monthDay}].
create or replace function public.friend_birthdays()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('user', b.user_id, 'name', left(coalesce(public.nexus_display_name(b.user_id), 'Iemand'), 40), 'monthDay', b.month_day) order by b.month_day), '[]'::jsonb)
  from public.birthdays b
  where auth.uid() is not null and b.shares and b.user_id <> auth.uid() and public.are_friends(auth.uid(), b.user_id);
$$;

-- Every birthday, for Beheer: [{name, monthDay}]. Refused for anyone who is not an admin.
create or replace function public.admin_birthdays()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_nexus_admin() then
    raise exception 'not an admin' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('name', public.nexus_admin_name(b.user_id), 'monthDay', b.month_day) order by b.month_day)
    from public.birthdays b
  ), '[]'::jsonb);
end $$;

-- Marks your messages from NEXUS as read (all when [p_ids] is null).
create or replace function public.system_messages_read(p_ids uuid[])
returns void language sql security definer set search_path = public as $$
  update public.system_messages set read_at = now()
   where user_id = auth.uid() and read_at is null and (p_ids is null or id = any(p_ids));
$$;

-- Once a day from 08:00 (Belgian time): "Gelukkige verjaardag" for whoever is jarig, a message to
-- each of their friends when they share it, and a push to the phones that have web push on.
-- A birthday on 29 February counts on 28 February in other years. Returns how many messages.
create or replace function nexus_private.birthday_greetings(p_now timestamptz default now())
returns int language plpgsql security definer set search_path = public, nexus_private as $$
declare
  v_local timestamp := p_now at time zone 'Europe/Brussels';
  v_year int := extract(year from v_local)::int;
  v_today text := to_char(v_local, 'MM-DD');
  v_days text[];
  v_count int := 0;
begin
  if extract(hour from v_local) < 8 then
    return 0;
  end if;
  v_days := array[v_today];
  if v_today = '02-28' and not ((v_year % 4 = 0 and v_year % 100 <> 0) or v_year % 400 = 0) then
    v_days := array_append(v_days, '02-29');
  end if;
  with jarig as (
    select b.user_id, b.shares, coalesce(public.nexus_display_name(b.user_id), '') as name
      from public.birthdays b where b.month_day = any(v_days)
  ), own as (
    insert into public.system_messages (user_id, ref, kind, title, body)
    select j.user_id, 'birthday:' || v_year, 'birthday', 'Gelukkige verjaardag! 🎂',
           'Gelukkige verjaardag' || case when j.name <> '' then ', ' || left(j.name, 40) else '' end || '! 🎉 NEXUS wenst je een fantastische dag.'
      from jarig j
    on conflict (user_id, ref) do nothing
    returning id, user_id, ref, title, body
  ), friends as (
    insert into public.system_messages (user_id, ref, kind, title, body, about_user)
    select o.other, 'friend-birthday:' || j.user_id || ':' || v_year, 'friend_birthday',
           left(coalesce(nullif(j.name, ''), 'Een vriend') || ' is vandaag jarig 🎂', 120),
           'Stuur ' || left(coalesce(nullif(j.name, ''), 'je vriend'), 40) || ' een berichtje om te feliciteren.', j.user_id
      from jarig j
      join public.friendships f on f.status = 'accepted' and j.user_id in (f.requester, f.addressee)
      cross join lateral (select case when f.requester = j.user_id then f.addressee else f.requester end as other) o
     where j.shares
    on conflict (user_id, ref) do nothing
    returning id, user_id, ref, title, body
  ), fresh as (
    select * from own union all select * from friends
  ), pushed as (
    insert into public.push_schedule (user_id, sender_device_id, recipient_device_id, ref, at, extra)
    select m.user_id, p.device_id, p.device_id, 'system:' || m.ref, now(),
           jsonb_build_object('kind', 'system', 'title', m.title, 'text', m.body, 'tag', 'system:' || m.ref)
      from fresh m
      join public.push_subscriptions p on p.user_id = m.user_id
      join public.devices d on d.id = p.device_id
     where d.revoked_at is null
    on conflict (recipient_device_id, ref) do nothing
    returning 1
  )
  -- Every insert above runs, also the pushes nobody reads back.
  select count(*) into v_count from fresh;
  if v_count > 0 then
    begin
      perform nexus_private.dispatch_push();
    exception when others then
      null;
    end;
  end if;
  return v_count;
end $$;
revoke all on function nexus_private.birthday_greetings(timestamptz) from public, anon, authenticated;

select cron.unschedule('nexus-birthdays') where exists (select 1 from cron.job where jobname = 'nexus-birthdays');
select cron.schedule('nexus-birthdays', '7 * * * *', 'select nexus_private.birthday_greetings()');
