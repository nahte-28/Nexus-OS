-- NEXUS Berichten op je gsm en horloge: a new privébericht or teamchat message wakes the phones
-- that have web push on (Apparaten › Meldingen op dit toestel), also when NEXUS is closed there;
-- Chrome passes it on to the watch. The notice has two quick replies (Oké 👍, Ik reageer straks).
-- Run after 20261021100000_push.sql, 20261103150000_push_actions.sql, 20261113090000_team_chat.sql
-- and 20261113180000_direct_messages.sql. Safe to run again.
--
-- A privébericht stays end-to-end encrypted: the phone gets the envelope the sender's NEXUS
-- already sealed for it; only the name of your friend travels next to it. A teamchat message is
-- not encrypted in the database, so its push carries the team, the sender and the text.
-- A quick reply uses a one-time token that only the woken phone gets; its SHA-256 stays here.

-- Per person: which messages wake your phone. No row means both on.
create table if not exists public.message_push (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  dm boolean not null default true,
  team boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table public.message_push enable row level security;
drop policy if exists "You read your message push settings" on public.message_push;
create policy "You read your message push settings" on public.message_push
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "You add your message push settings" on public.message_push;
create policy "You add your message push settings" on public.message_push
  for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists "You change your message push settings" on public.message_push;
create policy "You change your message push settings" on public.message_push
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- A push made by the database itself: no envelope (teamchat) or a fallback text next to one.
alter table public.push_schedule add column if not exists extra jsonb;
alter table public.push_schedule alter column ephemeral_key drop not null;
alter table public.push_schedule alter column iv drop not null;
alter table public.push_schedule alter column ciphertext drop not null;
do $$
begin
  alter table public.push_schedule add constraint push_schedule_body check (
    (ephemeral_key is not null and iv is not null and ciphertext is not null) or extra is not null);
exception when duplicate_object then null;
end $$;
do $$
begin
  alter table public.push_schedule add constraint push_schedule_extra check (
    extra is null or (jsonb_typeof(extra) = 'object' and pg_column_size(extra) <= 1500));
exception when duplicate_object then null;
end $$;

-- What your own devices plan stays an encrypted notice; only the database adds extra.
drop policy if exists "Users plan pushes between their own devices" on public.push_schedule;
create policy "Users plan pushes between their own devices" on public.push_schedule
  for insert to authenticated with check (
    (select auth.uid()) = user_id
    and extra is null and ephemeral_key is not null and iv is not null and ciphertext is not null
    and exists (select 1 from public.devices d where d.id = sender_device_id and d.user_id = (select auth.uid()))
    and exists (select 1 from public.devices d where d.id = recipient_device_id and d.user_id = (select auth.uid()))
  );

-- The same dispatcher as before, now with extra next to the envelope.
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
    returning p.endpoint, p.p256dh, p.auth, s.recipient_device_id, s.ref, s.ephemeral_key, s.iv, s.ciphertext, s.extra
  )
  select jsonb_agg(jsonb_build_object(
           'endpoint', endpoint, 'p256dh', p256dh, 'auth', auth,
           'payload', jsonb_strip_nulls(jsonb_build_object('ref', ref, 'to', recipient_device_id, 'ephemeralKey', ephemeral_key, 'iv', iv, 'ciphertext', ciphertext, 'extra', extra))))
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

-- One-time reply tokens (only their SHA-256), valid for a day.
create table if not exists nexus_private.message_replies (
  token_hash text primary key check (token_hash ~ '^[0-9a-f]{64}$'),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('dm', 'team')),
  -- The friend you answer, or the team.
  target uuid not null,
  expires_at timestamptz not null,
  used_at timestamptz
);
create index if not exists message_replies_expires on nexus_private.message_replies (expires_at);
alter table nexus_private.message_replies enable row level security;

create or replace function nexus_private.new_reply_token() returns text
language sql volatile as $$
  select replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
$$;

create or replace function nexus_private.token_hash(p_token text) returns text
language sql immutable as $$
  select encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
$$;

-- A new privébericht: the recipient's phones with web push get the envelope sealed for them.
create or replace function nexus_private.dm_push() returns trigger
language plpgsql security definer set search_path = public, nexus_private as $$
declare
  v_token text := nexus_private.new_reply_token();
  v_name text;
begin
  if not coalesce((select m.dm from public.message_push m where m.user_id = new.recipient), true) then
    return null;
  end if;
  if not exists (
    select 1 from public.push_subscriptions p join public.devices d on d.id = p.device_id
     where p.user_id = new.recipient and d.revoked_at is null
  ) then
    return null;
  end if;
  begin
    delete from nexus_private.message_replies where expires_at < now();
    v_name := coalesce((select f.display_name from public.friend_profiles f where f.user_id = new.sender), 'een vriend');
    insert into nexus_private.message_replies (token_hash, user_id, kind, target, expires_at)
    values (nexus_private.token_hash(v_token), new.recipient, 'dm', new.sender, now() + interval '1 day');
    insert into public.push_schedule (user_id, sender_device_id, recipient_device_id, ref, at, ephemeral_key, iv, ciphertext, extra)
    select new.recipient, p.device_id, p.device_id, 'dm:' || new.id, now(),
           case when fits then e ->> 'ephemeralKey' end, case when fits then e ->> 'iv' end, case when fits then e ->> 'ciphertext' end,
           jsonb_build_object('kind', 'dm', 'title', left('Bericht van ' || v_name, 80), 'tag', 'dm:' || new.sender, 'reply', v_token)
      from public.push_subscriptions p
      join public.devices d on d.id = p.device_id,
      lateral (select new.envelopes -> p.device_id::text as e) x,
      lateral (select jsonb_typeof(x.e) = 'object' and length(x.e ->> 'ephemeralKey') <= 200 and length(x.e ->> 'iv') <= 50
                      and length(x.e ->> 'ciphertext') <= 2500 as fits) y
     where p.user_id = new.recipient and d.revoked_at is null
    on conflict (recipient_device_id, ref) do nothing;
    perform nexus_private.dispatch_push();
  exception when others then
    -- A notice that cannot be planned never stops the message itself.
    null;
  end;
  return null;
end $$;
revoke all on function nexus_private.dm_push() from public, anon, authenticated;
drop trigger if exists dm_messages_push on public.dm_messages;
create trigger dm_messages_push after insert on public.dm_messages
  for each row execute function nexus_private.dm_push();

-- A new teamchat message: every other member's phones with web push.
create or replace function nexus_private.team_push() returns trigger
language plpgsql security definer set search_path = public, nexus_private as $$
declare
  v_team text;
  v_name text;
begin
  begin
    delete from nexus_private.message_replies where expires_at < now();
    v_team := coalesce((select g.name from public.study_groups g where g.id = new.group_id), 'Team');
    v_name := coalesce((select m.display_name from public.study_group_members m where m.group_id = new.group_id and m.user_id = new.user_id), 'Iemand');
    with people as materialized (
      select m.user_id, nexus_private.new_reply_token() as token
        from public.study_group_members m
       where m.group_id = new.group_id and m.user_id <> new.user_id
         and coalesce((select mp.team from public.message_push mp where mp.user_id = m.user_id), true)
         and exists (select 1 from public.push_subscriptions p join public.devices d on d.id = p.device_id
                      where p.user_id = m.user_id and d.revoked_at is null)
    ), tokens as (
      insert into nexus_private.message_replies (token_hash, user_id, kind, target, expires_at)
      select nexus_private.token_hash(token), user_id, 'team', new.group_id, now() + interval '1 day' from people
      returning user_id
    )
    insert into public.push_schedule (user_id, sender_device_id, recipient_device_id, ref, at, extra)
    select people.user_id, p.device_id, p.device_id, 'team-chat:' || new.id, now(),
           jsonb_build_object('kind', 'team', 'title', left(v_team, 80), 'text', left(v_name || ': ' || new.body, 400),
                              'tag', 'team-chat:' || new.group_id, 'reply', people.token)
      from people
      join public.push_subscriptions p on p.user_id = people.user_id
      join public.devices d on d.id = p.device_id
     where d.revoked_at is null and exists (select 1 from tokens t where t.user_id = people.user_id)
    on conflict (recipient_device_id, ref) do nothing;
    perform nexus_private.dispatch_push();
  exception when others then
    null;
  end;
  return null;
end $$;
revoke all on function nexus_private.team_push() from public, anon, authenticated;
drop trigger if exists team_messages_push on public.team_messages;
create trigger team_messages_push after insert on public.team_messages
  for each row execute function nexus_private.team_push();

-- For a quick reply to a privébericht, the phone seals the answer itself: these are the Connect
-- keys of both people (web and desktop, like dm_device_keys). Null for an unknown token.
create or replace function public.message_reply_keys(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public, nexus_private as $$
declare
  r nexus_private.message_replies;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    return null;
  end if;
  r := (select x from nexus_private.message_replies x
         where x.token_hash = nexus_private.token_hash(p_token) and x.used_at is null and x.expires_at > now());
  if r.token_hash is null then
    return null;
  end if;
  if r.kind = 'team' then
    return jsonb_build_object('kind', 'team');
  end if;
  if not public.are_friends(r.user_id, r.target) then
    return null;
  end if;
  return jsonb_build_object('kind', 'dm', 'devices', coalesce((
    select jsonb_agg(jsonb_build_object('deviceId', d.id, 'publicKey', d.public_key)) from (
      select d.*, row_number() over (partition by d.user_id order by d.last_seen_at desc) as n
        from public.devices d
       where d.user_id in (r.user_id, r.target) and d.revoked_at is null and d.platform in ('web', 'desktop')
    ) d where d.n <= 10), '[]'::jsonb));
end $$;

-- Sends the quick reply once: sealed envelopes for a privébericht, plain text for the teamchat.
create or replace function public.message_reply(p_token text, p_text text, p_envelopes jsonb) returns text
language plpgsql security definer set search_path = public, nexus_private as $$
declare
  r nexus_private.message_replies;
  v_text text := left(trim(coalesce(p_text, '')), 200);
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    return 'ongeldig';
  end if;
  r := (select x from nexus_private.message_replies x
         where x.token_hash = nexus_private.token_hash(p_token) and x.used_at is null and x.expires_at > now());
  if r.token_hash is null then
    return 'onbekend';
  end if;
  if r.kind = 'team' then
    if v_text = '' or not exists (select 1 from public.study_group_members m where m.group_id = r.target and m.user_id = r.user_id) then
      return 'ongeldig';
    end if;
    insert into public.team_messages (group_id, user_id, body) values (r.target, r.user_id, v_text);
  else
    if p_envelopes is null or jsonb_typeof(p_envelopes) <> 'object' or p_envelopes = '{}'::jsonb
       or pg_column_size(p_envelopes) > 65536 or not public.are_friends(r.user_id, r.target) then
      return 'ongeldig';
    end if;
    insert into public.dm_messages (sender, recipient, envelopes) values (r.user_id, r.target, p_envelopes);
  end if;
  update nexus_private.message_replies set used_at = now() where token_hash = r.token_hash;
  return 'verstuurd';
exception when others then
  return case when sqlerrm like '%too many messages%' then 'te vaak' else 'ongeldig' end;
end $$;

-- Only /api/push-reply calls these, with the anon key; the token is the proof.
do $$
declare fn text;
begin
  foreach fn in array array['message_reply_keys(text)', 'message_reply(text, text, jsonb)'] loop
    execute format('revoke all on function public.%s from public', fn);
    execute format('grant execute on function public.%s to anon, authenticated', fn);
  end loop;
end $$;
