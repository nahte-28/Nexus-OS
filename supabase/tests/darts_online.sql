-- NEXUS Darts online (20261116150000_darts_online.sql): only a friend can be invited, only the two
-- players see the match, each adds only their own visits in order, and nobody writes the table directly.
\set ON_ERROR_STOP 1
reset role;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000d81', 'do-host@test'), ('00000000-0000-0000-0000-000000000d82', 'do-vriend@test'),
  ('00000000-0000-0000-0000-000000000d83', 'do-vreemde@test');
insert into public.friend_profiles (user_id, display_name, code) values
  ('00000000-0000-0000-0000-000000000d81', 'Ethan', 'DRTSHSTX'), ('00000000-0000-0000-0000-000000000d82', 'Remo', 'DRTSVRND');
insert into public.friendships (requester, addressee, status, accepted_at) values
  ('00000000-0000-0000-0000-000000000d81', '00000000-0000-0000-0000-000000000d82', 'accepted', now());

create temp table if not exists darts_ids (id uuid);
grant all on darts_ids to authenticated;

-- 1. Inviting: a friend yes, someone else no.
set role authenticated;
set test.uid = '00000000-0000-0000-0000-000000000d81';
insert into darts_ids select public.darts_online_invite('00000000-0000-0000-0000-000000000d82', 501, 2, 1, true);
do $$ begin
  begin
    perform public.darts_online_invite('00000000-0000-0000-0000-000000000d83', 501, 2, 1, true);
    raise exception 'Een vreemde uitnodigen lukte';
  exception when insufficient_privilege then null;
  end;
  if (select public.darts_online_list() -> 0 ->> 'status') <> 'invited' then raise exception 'De uitnodiging staat niet in de lijst'; end if;
  if (select public.darts_online_list() -> 0 -> 'players') <> '["Ethan", "Remo"]'::jsonb then raise exception 'De namen kloppen niet'; end if;
  -- Not yet accepted: nobody can throw.
  begin
    perform public.darts_online_throw((select id from darts_ids), 0, 60, 3, null);
    raise exception 'Gooien voor het aanvaarden lukte';
  exception when serialization_failure then null;
  end;
  begin
    insert into public.darts_online (host, guest, host_name, guest_name, mode, legs_to_win, sets_to_win) values ('00000000-0000-0000-0000-000000000d81', '00000000-0000-0000-0000-000000000d83', 'a', 'b', 501, 1, 1);
    raise exception 'Rechtstreeks schrijven lukte';
  exception when insufficient_privilege then null;
  end;
end $$;

-- 2. The host cannot accept for the friend; the friend accepts.
do $$ begin
  begin
    perform public.darts_online_answer((select id from darts_ids), true);
    raise exception 'De host aanvaardde zelf';
  exception when insufficient_privilege then null;
  end;
end $$;
set test.uid = '00000000-0000-0000-0000-000000000d82';
select public.darts_online_answer((select id from darts_ids), true);
do $$ begin
  if (select public.darts_online_list() -> 0 ->> 'side')::int <> 1 then raise exception 'De gast staat niet als tweede'; end if;
end $$;

-- 3. Visits in order: a stale count changes nothing, only your own last visit can be taken back.
set test.uid = '00000000-0000-0000-0000-000000000d81';
do $$ begin
  if public.darts_online_throw((select id from darts_ids), 0, 100, 3, null) <> 1 then raise exception 'De eerste beurt telde niet'; end if;
  begin
    perform public.darts_online_throw((select id from darts_ids), 0, 60, 3, null);
    raise exception 'Een beurt met een oude stand lukte';
  exception when serialization_failure then null;
  end;
  begin
    perform public.darts_online_throw((select id from darts_ids), 1, 181, 3, null);
    raise exception 'Een beurt van 181 lukte';
  exception when invalid_parameter_value then null;
  end;
end $$;
set test.uid = '00000000-0000-0000-0000-000000000d82';
do $$ begin
  begin
    perform public.darts_online_undo((select id from darts_ids), 1);
    raise exception 'De gast nam de beurt van de host terug';
  exception when serialization_failure then null;
  end;
  if public.darts_online_throw((select id from darts_ids), 1, 45, 3, 1) <> 2 then raise exception 'De beurt van de gast telde niet'; end if;
  if public.darts_online_undo((select id from darts_ids), 2) <> 1 then raise exception 'De gast kon zijn beurt niet terugnemen'; end if;
  if public.darts_online_throw((select id from darts_ids), 1, 85, 3, null) <> 2 then raise exception 'De nieuwe beurt telde niet'; end if;
  if (select public.darts_online_list() -> 0 -> 'visits') <> '[{"side": 0, "score": 100, "darts": 3}, {"side": 1, "score": 85, "darts": 3}]'::jsonb then
    raise exception 'De beurten kloppen niet: %', public.darts_online_list() -> 0 -> 'visits';
  end if;
end $$;

-- 4. Someone else sees nothing and cannot throw; ending stops the match.
set test.uid = '00000000-0000-0000-0000-000000000d83';
do $$ begin
  if jsonb_array_length(public.darts_online_list()) <> 0 then raise exception 'Een vreemde ziet de match'; end if;
  if exists (select 1 from public.darts_online) then raise exception 'Een vreemde leest de tabel'; end if;
  begin
    perform public.darts_online_throw((select id from darts_ids), 2, 60, 3, null);
    raise exception 'Een vreemde gooide mee';
  exception when insufficient_privilege then null;
  end;
end $$;
set test.uid = '00000000-0000-0000-0000-000000000d81';
select public.darts_online_end((select id from darts_ids), 'stopped');
do $$ begin
  if (select public.darts_online_list() -> 0 ->> 'status') <> 'stopped' then raise exception 'De match stopte niet'; end if;
  begin
    perform public.darts_online_throw((select id from darts_ids), 2, 60, 3, null);
    raise exception 'Gooien na het stoppen lukte';
  exception when serialization_failure then null;
  end;
end $$;
reset role;
