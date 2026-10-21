-- NEXUS OS web-push: a phone with NEXUS in Chrome (without the companion) still gets reminders
-- when NEXUS is closed. The pc encrypts each notice for the phone ahead of time; every minute the
-- database hands what is due to /api/push, which wakes the phone. The server never sees the content.

-- Where a device can be woken (its Web Push subscription).
create table if not exists public.push_subscriptions (
  device_id uuid primary key references public.devices (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  endpoint text not null check (endpoint like 'https://%' and length(endpoint) <= 1000),
  p256dh text not null check (length(p256dh) <= 200),
  auth text not null check (length(auth) <= 100),
  updated_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;

create policy "Users read their own push subscriptions" on public.push_subscriptions
  for select to authenticated using ((select auth.uid()) = user_id);

-- Only for a device of the same user.
create policy "Users add push for their own devices" on public.push_subscriptions
  for insert to authenticated with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.devices d where d.id = device_id and d.user_id = (select auth.uid()) and d.revoked_at is null)
  );

create policy "Users update push for their own devices" on public.push_subscriptions
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "Users remove their own push subscriptions" on public.push_subscriptions
  for delete to authenticated using ((select auth.uid()) = user_id);

-- Planned notices, each encrypted for the recipient device like a Connect message.
create table if not exists public.push_schedule (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  sender_device_id uuid not null references public.devices (id) on delete cascade,
  recipient_device_id uuid not null references public.devices (id) on delete cascade,
  ref text not null check (length(ref) <= 300),
  at timestamptz not null,
  ephemeral_key text not null check (length(ephemeral_key) <= 200),
  iv text not null check (length(iv) <= 50),
  ciphertext text not null check (length(ciphertext) <= 2500),
  sent_at timestamptz,
  -- One per notice and phone: when two pcs plan the same reminder, the phone still gets it once.
  unique (recipient_device_id, ref)
);

create index if not exists push_schedule_due on public.push_schedule (at) where sent_at is null;

alter table public.push_schedule enable row level security;

create policy "Users read their own push schedule" on public.push_schedule
  for select to authenticated using ((select auth.uid()) = user_id);

create policy "Users plan pushes between their own devices" on public.push_schedule
  for insert to authenticated with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.devices d where d.id = sender_device_id and d.user_id = (select auth.uid()))
    and exists (select 1 from public.devices d where d.id = recipient_device_id and d.user_id = (select auth.uid()))
  );

create policy "Users remove their own planned pushes" on public.push_schedule
  for delete to authenticated using ((select auth.uid()) = user_id);

create or replace function public.push_schedule_limit() returns trigger
language plpgsql as $$
begin
  if (select count(*) from public.push_schedule where user_id = new.user_id) >= 500 then
    raise exception 'Te veel geplande meldingen.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists push_schedule_limit on public.push_schedule;
create trigger push_schedule_limit
  before insert on public.push_schedule
  for each row execute function public.push_schedule_limit();

-- Where to send due pushes, and the secret /api/push checks. Not reachable through the API.
create schema if not exists nexus_private;
revoke all on schema nexus_private from public, anon, authenticated;

create table if not exists nexus_private.push_config (
  id integer primary key default 1 check (id = 1),
  url text not null check (url like 'https://%'),
  secret text not null check (length(secret) >= 32)
);

create extension if not exists pg_net;
create extension if not exists pg_cron;

-- Every minute: mark what is due as sent and hand it to /api/push in one request.
create or replace function nexus_private.dispatch_push() returns void
language plpgsql security definer set search_path = public, nexus_private as $$
declare
  cfg nexus_private.push_config;
  batch jsonb;
begin
  select * into cfg from nexus_private.push_config where id = 1;
  if cfg is null then
    return;
  end if;
  with due as (
    update public.push_schedule s
       set sent_at = now()
      from public.push_subscriptions p, public.devices d
     where p.device_id = s.recipient_device_id
       and d.id = s.recipient_device_id
       and d.revoked_at is null
       and s.sent_at is null
       and s.at <= now()
       and s.at > now() - interval '6 hours'
    returning p.endpoint, p.p256dh, p.auth, s.recipient_device_id, s.ref, s.ephemeral_key, s.iv, s.ciphertext
  )
  select jsonb_agg(jsonb_build_object(
           'endpoint', endpoint, 'p256dh', p256dh, 'auth', auth,
           'payload', jsonb_build_object('ref', ref, 'to', recipient_device_id, 'ephemeralKey', ephemeral_key, 'iv', iv, 'ciphertext', ciphertext)))
    into batch
    from due;
  if batch is not null then
    perform net.http_post(
      url := cfg.url,
      body := jsonb_build_object('pushes', batch),
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || cfg.secret)
    );
  end if;
  delete from public.push_schedule where at < now() - interval '2 days';
end;
$$;

revoke all on function nexus_private.dispatch_push() from public, anon, authenticated;

select cron.unschedule('nexus-push') where exists (select 1 from cron.job where jobname = 'nexus-push');
select cron.schedule('nexus-push', '* * * * *', 'select nexus_private.dispatch_push()');

-- Last step, once, with your own values (Flow Studio > Developer > Web-push shows the exact line):
-- insert into nexus_private.push_config (url, secret) values ('https://<jouw-nexus>/api/push', '<geheim>')
--   on conflict (id) do update set url = excluded.url, secret = excluded.secret;
