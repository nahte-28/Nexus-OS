-- NEXUS Gamevrienden (20261103090000_team_gaming.sql): the team sees who is gaming and plans
-- sessions; everyone writes only their own playing row and answer; outsiders see nothing.
\set ON_ERROR_STOP 1
reset role;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000c1', 'gamer-owner@test'), ('00000000-0000-0000-0000-0000000000c2', 'gamer-lid@test'),
  ('00000000-0000-0000-0000-0000000000c3', 'gamer-kijker@test'), ('00000000-0000-0000-0000-0000000000c4', 'gamer-buiten@test');

set role authenticated;
set test.uid = '00000000-0000-0000-0000-0000000000c1';
select (public.create_study_group('Squad', 'Ethan')).id as team \gset
select set_config('test.team', :'team', false) is not null as ok \gset
select (public.create_team_invite(:'team', 'member', 24, null)).code as member_code \gset
select (public.create_team_invite(:'team', 'viewer', 24, null)).code as viewer_code \gset
set test.uid = '00000000-0000-0000-0000-0000000000c2';
select public.join_team(:'member_code', 'Lid') is not null as ok \gset
set test.uid = '00000000-0000-0000-0000-0000000000c3';
select public.join_team(:'viewer_code', 'Kijker') is not null as ok \gset

-- 1. The member shares what they play; a viewer may share too, but never for someone else.
set test.uid = '00000000-0000-0000-0000-0000000000c2';
insert into public.team_playing (group_id, game, started_at) values (:'team', 'Rocket League', 1000);
insert into public.team_playing (group_id, game, started_at) values (:'team', 'Rocket League', 2000)
  on conflict (group_id, user_id) do update set game = excluded.game, started_at = excluded.started_at;
set test.uid = '00000000-0000-0000-0000-0000000000c3';
insert into public.team_playing (group_id, game, started_at) values (:'team', 'Minecraft', 3000);
do $$ begin
  insert into public.team_playing (group_id, user_id, game, started_at) values (current_setting('test.team')::uuid, '00000000-0000-0000-0000-0000000000c1', 'Nep', 1);
  raise exception 'Iemand deelde het spelen van een ander';
exception when insufficient_privilege then null;
end $$;
do $$ declare n bigint; begin
  update public.team_playing set game = 'Nep' where user_id = '00000000-0000-0000-0000-0000000000c2';
  get diagnostics n = row_count;
  if n > 0 then raise exception 'Iemand wijzigde het spelen van een ander'; end if;
  if (select count(*) from public.team_playing) <> 2 then raise exception 'Het team ziet niet wie speelt'; end if;
  if (select started_at from public.team_playing where user_id = '00000000-0000-0000-0000-0000000000c2') <> 2000 then raise exception 'Bijwerken van het spelen lukte niet'; end if;
end $$;

-- 2. Members plan a session, viewers do not; everyone answers for themselves.
set test.uid = '00000000-0000-0000-0000-0000000000c2';
insert into public.team_game_plans (id, group_id, game, starts_at, note) values ('00000000-0000-0000-0000-0000000000d1', :'team', 'Rocket League', 9999999999999, 'ranked');
insert into public.team_game_rsvp (plan_id, group_id, answer) values ('00000000-0000-0000-0000-0000000000d1', :'team', 'yes');
set test.uid = '00000000-0000-0000-0000-0000000000c3';
do $$ begin
  insert into public.team_game_plans (group_id, game, starts_at) values (current_setting('test.team')::uuid, 'Nee', 1);
  raise exception 'Een kijker kon een sessie plannen';
exception when insufficient_privilege then null;
end $$;
insert into public.team_game_rsvp (plan_id, group_id, answer) values ('00000000-0000-0000-0000-0000000000d1', :'team', 'maybe');
insert into public.team_game_rsvp (plan_id, group_id, answer) values ('00000000-0000-0000-0000-0000000000d1', :'team', 'no')
  on conflict (plan_id, user_id) do update set answer = excluded.answer, updated_at = now();
do $$ declare n bigint; begin
  update public.team_game_rsvp set answer = 'no' where user_id = '00000000-0000-0000-0000-0000000000c2';
  get diagnostics n = row_count;
  if n > 0 then raise exception 'Iemand wijzigde het antwoord van een ander'; end if;
  if (select string_agg(answer, ',' order by answer) from public.team_game_rsvp) <> 'no,yes' then raise exception 'De antwoorden kloppen niet'; end if;
  -- A viewer does not remove someone else's plan.
  delete from public.team_game_plans;
  get diagnostics n = row_count;
  if n > 0 then raise exception 'Een kijker verwijderde een sessie'; end if;
end $$;

-- 3. An outsider sees nothing and cannot write into the team.
set test.uid = '00000000-0000-0000-0000-0000000000c4';
do $$ begin
  if exists (select 1 from public.team_playing) or exists (select 1 from public.team_game_plans) or exists (select 1 from public.team_game_rsvp) then
    raise exception 'Iemand buiten het team ziet de gamevrienden';
  end if;
  begin
    insert into public.team_playing (group_id, game, started_at) values (current_setting('test.team')::uuid, 'Binnendringen', 1);
    raise exception 'Iemand buiten het team deelde zijn spelen erin';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.team_game_rsvp (plan_id, group_id, answer) values ('00000000-0000-0000-0000-0000000000d1', current_setting('test.team')::uuid, 'yes');
    raise exception 'Iemand buiten het team antwoordde';
  exception when insufficient_privilege then null;
  end;
end $$;

-- 4. Old plans go away on the next plan; the maker or a manager removes; leaving takes your rows away.
reset role;
insert into public.team_game_plans (group_id, game, starts_at, created_by) values (:'team', 'Oud', 1, '00000000-0000-0000-0000-0000000000c2');
set role authenticated;
set test.uid = '00000000-0000-0000-0000-0000000000c1';
insert into public.team_game_plans (group_id, game, starts_at) values (:'team', 'Nieuw', 9999999999999);
do $$ begin
  if exists (select 1 from public.team_game_plans where game = 'Oud') then raise exception 'Een oude sessie bleef staan'; end if;
end $$;
delete from public.team_game_plans where id = '00000000-0000-0000-0000-0000000000d1';
do $$ begin
  if exists (select 1 from public.team_game_rsvp) then raise exception 'Antwoorden bleven achter na het verwijderen'; end if;
end $$;
select public.remove_team_member(:'team', '00000000-0000-0000-0000-0000000000c3') \gset
do $$ begin
  if exists (select 1 from public.team_playing where user_id = '00000000-0000-0000-0000-0000000000c3') then raise exception 'Wie het team verliet, speelt er nog'; end if;
end $$;
reset role;
