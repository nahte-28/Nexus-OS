-- NEXUS meldingsknoppen (20261103150000_push_actions.sql): only the right token ticks off a
-- deadline or snoozes a notice, and only for the owner of that notice.
\set ON_ERROR_STOP 1
reset role;
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000d1', 'knop@test'), ('00000000-0000-0000-0000-0000000000d2', 'ander@test');
insert into public.devices (id, user_id, name, platform, public_key) values
  ('00000000-0000-0000-0000-00000000d0a1', '00000000-0000-0000-0000-0000000000d1', 'pc', 'web', repeat('A', 88)),
  ('00000000-0000-0000-0000-00000000d0a2', '00000000-0000-0000-0000-0000000000d1', 'gsm', 'web', repeat('B', 88));
insert into public.life_items (id, user_id, kind, data, updated_at) values
  ('00000000-0000-0000-0000-00000000dd01', '00000000-0000-0000-0000-0000000000d1', 'deadline', '{"title":"Verslag","doneAt":null}', 1),
  ('00000000-0000-0000-0000-00000000dd02', '00000000-0000-0000-0000-0000000000d2', 'deadline', '{"title":"Van een ander","doneAt":null}', 1);
insert into public.push_schedule (user_id, sender_device_id, recipient_device_id, ref, at, ephemeral_key, iv, ciphertext, token_hash, sent_at) values
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-00000000d0a1', '00000000-0000-0000-0000-00000000d0a2',
   'deadline:00000000-0000-0000-0000-00000000dd01@100-60', now(), 'k', 'i', 'c', encode(sha256(convert_to('geheim-token-van-de-gsm-123', 'UTF8')), 'hex'), now()),
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-00000000d0a1', '00000000-0000-0000-0000-00000000d0a2',
   'deadline:00000000-0000-0000-0000-00000000dd01@100-0', now() + interval '1 day', 'k', 'i', 'c', null, null),
  -- A notice that tries to tick off someone else's deadline with its own valid token.
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-00000000d0a1', '00000000-0000-0000-0000-00000000d0a2',
   'deadline:00000000-0000-0000-0000-00000000dd02@100-60', now(), 'k', 'i', 'c', encode(sha256(convert_to('token-voor-de-ander-12345', 'UTF8')), 'hex'), now());

set role anon;
do $$ begin
  if public.push_action('deadline:00000000-0000-0000-0000-00000000dd01@100-60', 'fout-token-van-iemand-anders', 'done') <> 'onbekend' then raise exception 'Een fout token werd aanvaard'; end if;
  if public.push_action('deadline:00000000-0000-0000-0000-00000000dd01@100-60', 'geheim-token-van-de-gsm-123', 'wis') <> 'ongeldig' then raise exception 'Een onbekende knop werd aanvaard'; end if;
  if public.push_action('deadline:00000000-0000-0000-0000-00000000dd01@100-60', 'geheim-token-van-de-gsm-123', 'later') <> 'later' then raise exception 'Later lukte niet'; end if;
  if public.push_action('deadline:00000000-0000-0000-0000-00000000dd02@100-60', 'token-voor-de-ander-12345', 'done') <> 'klaar' then raise exception 'Klaar gaf geen antwoord'; end if;
  if public.push_action('deadline:00000000-0000-0000-0000-00000000dd01@100-60', 'geheim-token-van-de-gsm-123', 'done') <> 'klaar' then raise exception 'Klaar lukte niet'; end if;
end $$;
do $$ begin
  if exists (select 1 from public.life_items) then raise exception 'Anon kan life_items lezen'; end if;
exception when insufficient_privilege then null;
end $$;

reset role;
do $$ begin
  if (select data->>'doneAt' from public.life_items where id = '00000000-0000-0000-0000-00000000dd01') is null then raise exception 'De deadline staat niet op klaar'; end if;
  if (select data->>'doneAt' from public.life_items where id = '00000000-0000-0000-0000-00000000dd02') is not null then raise exception 'De deadline van een ander werd afgevinkt'; end if;
  if exists (select 1 from public.push_schedule where ref like 'deadline:00000000-0000-0000-0000-00000000dd01@%' and sent_at is null) then raise exception 'Wachtende meldingen van de afgevinkte deadline bleven staan'; end if;
end $$;
-- Later on a fresh notice: a copy an hour from now, at most five.
insert into public.push_schedule (user_id, sender_device_id, recipient_device_id, ref, at, ephemeral_key, iv, ciphertext, token_hash, sent_at) values
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-00000000d0a1', '00000000-0000-0000-0000-00000000d0a2',
   'reminder:r1@5', now(), 'k', 'i', 'c', encode(sha256(convert_to('herinnering-token-123456', 'UTF8')), 'hex'), now());
set role anon;
do $$ declare r text; begin
  if public.push_action('reminder:r1@5', 'herinnering-token-123456', 'done') <> 'ongeldig' then raise exception 'Klaar op een herinnering werd aanvaard'; end if;
  for i in 1..5 loop
    r := public.push_action('reminder:r1@5', 'herinnering-token-123456', 'later');
    perform pg_sleep(0.002);
  end loop;
  if public.push_action('reminder:r1@5', 'herinnering-token-123456', 'later') <> 'te vaak' then raise exception 'Later kon onbeperkt'; end if;
end $$;
reset role;
do $$ begin
  if (select count(*) from public.push_schedule where ref like 'reminder:r1@5~later%' and sent_at is null and at > now() + interval '50 minutes') <> 5 then raise exception 'Later plande geen kopie over een uur'; end if;
end $$;
