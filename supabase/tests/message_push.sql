-- NEXUS Berichten op je gsm (20261116090000_message_push.sql): a privébericht or teamchat message
-- plans a push only for the recipients' phones with web push, the sealed envelope goes along
-- untouched, a quick reply works once with its token, and the setting turns it off.
\set ON_ERROR_STOP 1
reset role;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000001a01', 'mp-a@test'), ('00000000-0000-0000-0000-000000001a02', 'mp-b@test'),
  ('00000000-0000-0000-0000-000000001a03', 'mp-c@test');
insert into public.devices (id, user_id, name, platform, public_key) values
  ('00000000-0000-0000-0000-000000001b01', '00000000-0000-0000-0000-000000001a01', 'A pc', 'web', repeat('A', 88)),
  ('00000000-0000-0000-0000-000000001b02', '00000000-0000-0000-0000-000000001a02', 'B gsm', 'web', repeat('B', 88)),
  ('00000000-0000-0000-0000-000000001b03', '00000000-0000-0000-0000-000000001a02', 'B pc', 'desktop', repeat('C', 88));
insert into public.push_subscriptions (device_id, user_id, endpoint, p256dh, auth) values
  ('00000000-0000-0000-0000-000000001b02', '00000000-0000-0000-0000-000000001a02', 'https://push.example/b', 'k', 'a');
insert into public.friendships (requester, addressee, status, accepted_at) values
  ('00000000-0000-0000-0000-000000001a01', '00000000-0000-0000-0000-000000001a02', 'accepted', now());
insert into public.friend_profiles (user_id, display_name, code) values ('00000000-0000-0000-0000-000000001a01', 'Ethan', 'MPAAAA22');

-- 1. A privébericht wakes B's phone with the envelope sealed for it, not B's pc.
set role authenticated;
set test.uid = '00000000-0000-0000-0000-000000001a01';
insert into public.dm_messages (id, recipient, envelopes) values ('00000000-0000-0000-0000-000000001c01', '00000000-0000-0000-0000-000000001a02',
  '{"00000000-0000-0000-0000-000000001b02": {"ephemeralKey": "EK", "iv": "IV", "ciphertext": "CT"}, "00000000-0000-0000-0000-000000001b03": {"ephemeralKey": "x", "iv": "y", "ciphertext": "z"}}');
reset role;
do $$ begin
  if (select count(*) from public.push_schedule where ref = 'dm:00000000-0000-0000-0000-000000001c01') <> 1 then raise exception 'Het bericht plande niet precies één push'; end if;
  if not exists (select 1 from public.push_schedule where ref = 'dm:00000000-0000-0000-0000-000000001c01'
      and recipient_device_id = '00000000-0000-0000-0000-000000001b02' and user_id = '00000000-0000-0000-0000-000000001a02'
      and ciphertext = 'CT' and iv = 'IV' and ephemeral_key = 'EK' and extra ->> 'title' = 'Bericht van Ethan'
      and extra ->> 'tag' = 'dm:00000000-0000-0000-0000-000000001a01' and extra ->> 'reply' ~ '^[0-9a-f]{64}$') then
    raise exception 'De push voor het bericht klopt niet';
  end if;
end $$;
select extra ->> 'reply' as dm_token from public.push_schedule where ref = 'dm:00000000-0000-0000-0000-000000001c01' \gset

-- 2. Your own devices still cannot plan a push with extra, nor one without an envelope.
set role authenticated;
set test.uid = '00000000-0000-0000-0000-000000001a02';
do $$ begin
  insert into public.push_schedule (sender_device_id, recipient_device_id, ref, at, extra) values
    ('00000000-0000-0000-0000-000000001b03', '00000000-0000-0000-0000-000000001b02', 'vals', now(), '{"title": "Nep"}');
  raise exception 'Een eigen push met extra lukte';
exception when insufficient_privilege then null;
end $$;

-- 3. The quick reply with the token: keys of both, then one answer, and the token is spent.
set role anon;
set test.uid = '';
do $$ begin
  if public.message_reply_keys(repeat('0', 64)) is not null then raise exception 'Sleutels voor een onbekende token'; end if;
  if public.message_reply(repeat('0', 64), 'Oké', '{"x": {}}') <> 'onbekend' then raise exception 'Antwoord met een onbekende token'; end if;
end $$;
select public.message_reply_keys(:'dm_token') as keys \gset
select set_config('test.keys', :'keys', false) is not null as ok \gset
do $$ declare k jsonb := current_setting('test.keys')::jsonb; begin
  if k ->> 'kind' <> 'dm' or jsonb_array_length(k -> 'devices') <> 3 then raise exception 'De sleutels voor een snel antwoord kloppen niet: %', k; end if;
end $$;
select public.message_reply(:'dm_token', 'Oké 👍', '{"00000000-0000-0000-0000-000000001b01": {"ephemeralKey": "a", "iv": "b", "ciphertext": "c"}}') as sent \gset
select set_config('test.sent', :'sent', false) is not null as ok \gset
select public.message_reply(:'dm_token', 'Nog eens', '{"x": {}}') as again \gset
select set_config('test.again', :'again', false) is not null as ok \gset
reset role;
do $$ begin
  if current_setting('test.sent') <> 'verstuurd' then raise exception 'Het snelle antwoord ging niet weg: %', current_setting('test.sent'); end if;
  if current_setting('test.again') <> 'onbekend' then raise exception 'De token werkte twee keer'; end if;
  if not exists (select 1 from public.dm_messages where sender = '00000000-0000-0000-0000-000000001a02' and recipient = '00000000-0000-0000-0000-000000001a01') then
    raise exception 'Het antwoord staat niet bij de berichten';
  end if;
  -- A has no phone with web push: the answer plans nothing.
  if exists (select 1 from public.push_schedule where user_id = '00000000-0000-0000-0000-000000001a01') then raise exception 'Push voor iemand zonder web push'; end if;
end $$;

-- 4. Teamchat: the other member's phone gets team, sender and text; the reply goes in the chat.
set role authenticated;
set test.uid = '00000000-0000-0000-0000-000000001a01';
select (public.create_study_group('Labogroep', 'Ethan')).id as team \gset
select (public.create_team_invite(:'team', 'member', 24, null)).code as code \gset
set test.uid = '00000000-0000-0000-0000-000000001a02';
select public.join_team(:'code', 'Remo') is not null as ok \gset
set test.uid = '00000000-0000-0000-0000-000000001a01';
insert into public.team_messages (id, group_id, body) values ('00000000-0000-0000-0000-000000001c02', :'team', 'Om 14 u in B.204?');
reset role;
do $$ begin
  if not exists (select 1 from public.push_schedule where ref = 'team-chat:00000000-0000-0000-0000-000000001c02'
      and user_id = '00000000-0000-0000-0000-000000001a02' and ciphertext is null
      and extra ->> 'title' = 'Labogroep' and extra ->> 'text' = 'Ethan: Om 14 u in B.204?') then
    raise exception 'De push voor de teamchat klopt niet';
  end if;
  if (select count(*) from public.push_schedule where ref = 'team-chat:00000000-0000-0000-0000-000000001c02') <> 1 then raise exception 'De schrijver kreeg zelf een push'; end if;
end $$;
select extra ->> 'reply' as team_token from public.push_schedule where ref = 'team-chat:00000000-0000-0000-0000-000000001c02' \gset
set role anon;
select public.message_reply(:'team_token', 'Ik reageer straks.', null) as sent \gset
select set_config('test.sent', :'sent', false) is not null as ok \gset
reset role;
do $$ begin
  if current_setting('test.sent') <> 'verstuurd' then raise exception 'Het antwoord in de teamchat ging niet weg'; end if;
  if not exists (select 1 from public.team_messages where user_id = '00000000-0000-0000-0000-000000001a02' and body = 'Ik reageer straks.') then
    raise exception 'Het antwoord staat niet in de teamchat';
  end if;
end $$;

-- 5. Turned off: no more pushes for privéberichten; others cannot read or change your setting.
set role authenticated;
set test.uid = '00000000-0000-0000-0000-000000001a02';
insert into public.message_push (dm, team) values (false, true);
set test.uid = '00000000-0000-0000-0000-000000001a01';
do $$ begin
  if exists (select 1 from public.message_push) then raise exception 'Iemand anders ziet je instelling'; end if;
end $$;
update public.message_push set dm = true;
insert into public.dm_messages (id, recipient, envelopes) values ('00000000-0000-0000-0000-000000001c03', '00000000-0000-0000-0000-000000001a02', '{"00000000-0000-0000-0000-000000001b02": {"ephemeralKey": "EK", "iv": "IV", "ciphertext": "CT"}}');
reset role;
do $$ begin
  if exists (select 1 from public.push_schedule where ref = 'dm:00000000-0000-0000-0000-000000001c03') then raise exception 'Push terwijl privéberichten uit staan'; end if;
  if (select dm from public.message_push where user_id = '00000000-0000-0000-0000-000000001a02') then raise exception 'Iemand anders zette je instelling aan'; end if;
end $$;
