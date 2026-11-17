-- NEXUS Leerkaarten-duel (20261117090000_card_duels.sql): only a friend can be challenged, the
-- answers stay hidden until you played, the database counts the score and each one plays once.
\set ON_ERROR_STOP 1
reset role;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000d91', 'cd-ethan@test'), ('00000000-0000-0000-0000-000000000d92', 'cd-remo@test'),
  ('00000000-0000-0000-0000-000000000d93', 'cd-vreemde@test');
insert into public.friend_profiles (user_id, display_name, code) values
  ('00000000-0000-0000-0000-000000000d91', 'Ethan', 'DUELETHN'), ('00000000-0000-0000-0000-000000000d92', 'Remo', 'DUELREMB');
insert into public.friendships (requester, addressee, status, accepted_at) values
  ('00000000-0000-0000-0000-000000000d91', '00000000-0000-0000-0000-000000000d92', 'accepted', now());

create temp table if not exists duel_ids (id uuid);
grant all on duel_ids to authenticated;

-- 1. Ethan challenges Remo; a stranger and bad questions are refused; nobody reads the answers.
set role authenticated;
set test.uid = '00000000-0000-0000-0000-000000000d91';
insert into duel_ids select public.card_duel_create('00000000-0000-0000-0000-000000000d92', 'Elektronica',
  '[{"front": "Wet van Ohm", "options": ["U=RI", "P=UI", "Q=It", "F=ma"]}, {"front": "Eenheid van R", "options": ["V", "A", "Ω", "W"]}]'::jsonb, array[0, 2]);
do $$ begin
  begin
    perform public.card_duel_create('00000000-0000-0000-0000-000000000d93', '', '[{"front": "x", "options": ["a", "b", "c", "d"]}]'::jsonb, array[0]);
    raise exception 'Een vreemde uitdagen lukte';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.card_duel_create('00000000-0000-0000-0000-000000000d92', '', '[{"front": "x", "options": ["a", "b"]}]'::jsonb, array[0]);
    raise exception 'Twee antwoorden aanvaard';
  exception when invalid_parameter_value then null;
  end;
  if (select count(*) from public.card_duel_results) <> 0 then raise exception 'De antwoorden zijn te lezen'; end if;
  if (public.card_duels_list() -> 0 -> 'answers') <> 'null'::jsonb then raise exception 'Antwoorden zichtbaar voor het spelen'; end if;
  -- Ethan plays: one right.
  if public.card_duel_play((select id from duel_ids), array[0, 1], 8000) <> 1 then raise exception 'De score van Ethan klopt niet'; end if;
  begin
    perform public.card_duel_play((select id from duel_ids), array[0, 2], 1000);
    raise exception 'Twee keer spelen lukte';
  exception when insufficient_privilege then null;
  end;
  if (public.card_duels_list() -> 0 ->> 'answers') <> '[0, 2]' then raise exception 'Na het spelen geen antwoorden'; end if;
end $$;

-- 2. Remo does not see the answers or Ethan's score before playing, then wins.
set test.uid = '00000000-0000-0000-0000-000000000d92';
do $$ begin
  if (public.card_duels_list() -> 0 -> 'answers') <> 'null'::jsonb then raise exception 'Remo ziet de antwoorden'; end if;
  if (public.card_duels_list() -> 0 -> 'theirScore') <> 'null'::jsonb then raise exception 'Remo ziet de score van Ethan'; end if;
  if (public.card_duels_list() -> 0 ->> 'theirPlayed')::boolean is not true then raise exception 'Remo ziet niet dat Ethan speelde'; end if;
  if public.card_duel_play((select id from duel_ids), array[0, 2], 9000) <> 2 then raise exception 'De score van Remo klopt niet'; end if;
  if (public.card_duels_list() -> 0 ->> 'status') <> 'done' then raise exception 'Het duel is niet afgelopen'; end if;
  if (public.card_duels_list() -> 0 ->> 'theirScore')::int <> 1 then raise exception 'Remo ziet de score van Ethan niet'; end if;
end $$;

-- 3. A stranger sees nothing; declining works only for the one challenged.
set test.uid = '00000000-0000-0000-0000-000000000d93';
do $$ begin
  if jsonb_array_length(public.card_duels_list()) <> 0 then raise exception 'Een vreemde ziet het duel'; end if;
  if (select count(*) from public.card_duels) <> 0 then raise exception 'Een vreemde leest de tabel'; end if;
end $$;
set test.uid = '00000000-0000-0000-0000-000000000d91';
truncate duel_ids;
insert into duel_ids select public.card_duel_create('00000000-0000-0000-0000-000000000d92', '', '[{"front": "x", "options": ["a", "b", "c", "d"]}]'::jsonb, array[3]);
do $$ begin
  begin
    perform public.card_duel_decline((select id from duel_ids));
    raise exception 'De uitdager sloeg zijn eigen duel af';
  exception when insufficient_privilege then null;
  end;
end $$;
set test.uid = '00000000-0000-0000-0000-000000000d92';
select public.card_duel_decline((select id from duel_ids));
do $$ begin
  if (public.card_duels_list() -> 0 ->> 'status') <> 'declined' then raise exception 'Afslaan telde niet'; end if;
end $$;
reset role;
