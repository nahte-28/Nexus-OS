-- NEXUS Samen studeren (20261114090000_study_together.sql): only friends and teammates see and join
-- a session, nobody writes the tables directly, and when the host leaves the session ends.
\set ON_ERROR_STOP 1
reset role;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000e41', 'samen-host@test'), ('00000000-0000-0000-0000-000000000e42', 'samen-vriend@test'),
  ('00000000-0000-0000-0000-000000000e43', 'samen-team@test'), ('00000000-0000-0000-0000-000000000e44', 'samen-vreemde@test');
insert into public.friend_profiles (user_id, display_name, code) values
  ('00000000-0000-0000-0000-000000000e41', 'Hanne', 'HANNESTD'), ('00000000-0000-0000-0000-000000000e42', 'Vic', 'VKCVSTDY');
insert into public.friendships (requester, addressee, status, accepted_at) values
  ('00000000-0000-0000-0000-000000000e41', '00000000-0000-0000-0000-000000000e42', 'accepted', now());
insert into public.study_groups (id, name, invite_code, created_by) values ('00000000-0000-0000-0000-00000000e4a0', 'Samen-team', 'SAMENTMX', '00000000-0000-0000-0000-000000000e41');
insert into public.study_group_members (group_id, user_id, display_name) values
  ('00000000-0000-0000-0000-00000000e4a0', '00000000-0000-0000-0000-000000000e41', 'Hanne'),
  ('00000000-0000-0000-0000-00000000e4a0', '00000000-0000-0000-0000-000000000e43', 'Tom');

set role authenticated;
set test.uid = '00000000-0000-0000-0000-000000000e41';
create temp table if not exists samen_ids (id uuid);
grant all on samen_ids to authenticated;
insert into samen_ids select public.start_study_session('  Examen wiskunde  ', 25, 5);
do $$ begin
  if (select public.study_sessions_list() -> 0 ->> 'title') <> 'Examen wiskunde' then raise exception 'De titel is niet bijgesneden'; end if;
  if (select (public.study_sessions_list() -> 0 ->> 'mine')::boolean) is not true then raise exception 'De host ziet niet dat het zijn sessie is'; end if;
  begin
    perform public.start_study_session('x', 200, 5);
    raise exception 'Een focusblok van 200 minuten lukte';
  exception when check_violation then null;
  end;
end $$;

set test.uid = '00000000-0000-0000-0000-000000000e44';
do $$ begin
  if jsonb_array_length(public.study_sessions_list()) <> 0 then raise exception 'Een vreemde ziet de sessie'; end if;
  begin
    perform public.join_study_session((select id from samen_ids));
    raise exception 'Een vreemde kon meedoen';
  exception when insufficient_privilege then null;
  end;
  if exists (select 1 from public.study_sessions) or exists (select 1 from public.study_session_members) then raise exception 'De tabellen zijn leesbaar'; end if;
  begin
    insert into public.study_sessions (title, focus_minutes, break_minutes) values ('x', 25, 5);
    raise exception 'Rechtstreeks schrijven lukte';
  exception when insufficient_privilege then null;
  end;
end $$;

set test.uid = '00000000-0000-0000-0000-000000000e42';
select public.join_study_session((select id from samen_ids));
set test.uid = '00000000-0000-0000-0000-000000000e43';
select public.join_study_session((select id from samen_ids));
do $$ begin
  if (select jsonb_path_query_array(public.study_sessions_list() -> 0 -> 'members', '$[*].name')) <> '["Hanne", "Vic", "Tom"]'::jsonb then
    raise exception 'De deelnemers kloppen niet: %', public.study_sessions_list() -> 0 -> 'members';
  end if;
  if (select public.study_sessions_list() -> 0 ->> 'host') <> 'Hanne' then raise exception 'De naam van de host klopt niet'; end if;
end $$;
select public.leave_study_session((select id from samen_ids));
do $$ begin
  if jsonb_array_length(public.study_sessions_list() -> 0 -> 'members') <> 2 then raise exception 'Weggaan telt niet'; end if;
end $$;

set test.uid = '00000000-0000-0000-0000-000000000e41';
select public.leave_study_session((select id from samen_ids));
set test.uid = '00000000-0000-0000-0000-000000000e42';
do $$ begin
  if jsonb_array_length(public.study_sessions_list()) <> 0 then raise exception 'De sessie loopt nog nadat de host wegging'; end if;
end $$;
reset role;
