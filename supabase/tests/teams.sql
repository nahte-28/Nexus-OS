-- NEXUS Teams (20261030150000_teams.sql): roles decide who may do what, invitations expire and run
-- out, and shared project tasks are for the team only. Runs after rls.sql.
\set ON_ERROR_STOP 1
reset role;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'owner@test'), ('00000000-0000-0000-0000-0000000000a2', 'admin@test'),
  ('00000000-0000-0000-0000-0000000000a3', 'member@test'), ('00000000-0000-0000-0000-0000000000a4', 'viewer@test'),
  ('00000000-0000-0000-0000-0000000000a5', 'outsider@test');

-- 1. The owner makes a team and invitations.
set role authenticated;
set test.uid = '00000000-0000-0000-0000-0000000000a1';
select (public.create_study_group('Team', 'Owner')).id as team \gset
do $$ begin
  if public.study_group_role((select id from public.study_groups where name = 'Team')) <> 'owner' then raise exception 'Wie een team maakt, is niet de eigenaar'; end if;
end $$;
select (public.create_team_invite(:'team', 'admin', 24, 1)).code as admin_code \gset
select (public.create_team_invite(:'team', 'member', 24, null)).code as member_code \gset
select (public.create_team_invite(:'team', 'viewer', 24, null)).code as viewer_code \gset
select (public.create_team_invite(:'team', 'member', 1, null)).code as old_code \gset
reset role;
-- Make that last one expired.
update public.team_invites set expires_at = now() - interval '1 minute' where code = :'old_code';

-- 2. People join with the invitation that fits their role.
set role authenticated;
set test.uid = '00000000-0000-0000-0000-0000000000a2';
select public.join_team(:'admin_code', 'Admin') is not null as ok \gset
set test.uid = '00000000-0000-0000-0000-0000000000a3';
select public.join_team(:'member_code', 'Member') is not null as ok \gset
set test.uid = '00000000-0000-0000-0000-0000000000a4';
select public.join_team(:'viewer_code', 'Viewer') is not null as ok \gset
reset role;
do $$ begin
  if (select string_agg(role, ',' order by role) from public.study_group_members m join public.study_groups g on g.id = m.group_id where g.name = 'Team') <> 'admin,member,owner,viewer' then
    raise exception 'De rollen na het aansluiten kloppen niet';
  end if;
end $$;

-- 3. An expired invitation no longer works; an unknown one gives null.
set role authenticated;
set test.uid = '00000000-0000-0000-0000-0000000000a5';
create temporary table if not exists codes (name text, code text);
insert into codes values ('old', :'old_code'), ('admin', :'admin_code');
do $$ begin
  perform public.join_team((select code from codes where name = 'old'), 'Te laat');
  raise exception 'Een vervallen uitnodiging werkte nog';
exception when raise_exception then
  if sqlerrm <> 'invite expired' then raise; end if;
end $$;
-- The admin invitation could be used once.
do $$ begin
  perform public.join_team((select code from codes where name = 'admin'), 'Nog een admin');
  raise exception 'Een opgebruikte uitnodiging werkte nog';
exception when raise_exception then
  if sqlerrm <> 'invite used up' then raise; end if;
end $$;
do $$ begin
  if public.join_team('AAAAAAAAAA', 'x') is not null then raise exception 'Een onbekende code gaf een team'; end if;
end $$;
-- The outsider sees nothing of the team.
do $$ begin
  if exists (select 1 from public.study_groups) or exists (select 1 from public.team_invites) or exists (select 1 from public.team_projects) then
    raise exception 'Iemand buiten het team ziet het team';
  end if;
end $$;
reset role;

-- 4. Members work on shared projects; viewers only read.
set role authenticated;
set test.uid = '00000000-0000-0000-0000-0000000000a3';
insert into codes values ('team', :'team');
insert into public.team_projects (id, group_id, name) values ('00000000-0000-0000-0000-0000000000f1', :'team', 'Labo');
insert into public.team_project_tasks (id, project_id, group_id, title, assignee) values
  ('00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000f1', :'team', 'Verslag', '00000000-0000-0000-0000-0000000000a4');
set test.uid = '00000000-0000-0000-0000-0000000000a2';
update public.team_project_tasks set status = 'doing' where id = '00000000-0000-0000-0000-0000000000f2';
do $$ begin
  if (select updated_by from public.team_project_tasks where id = '00000000-0000-0000-0000-0000000000f2') <> '00000000-0000-0000-0000-0000000000a2' then
    raise exception 'De taak onthoudt niet wie ze laatst wijzigde';
  end if;
end $$;
set test.uid = '00000000-0000-0000-0000-0000000000a4';
do $$ declare n bigint; begin
  if (select count(*) from public.team_project_tasks) <> 1 then raise exception 'Een kijker ziet de projecttaken niet'; end if;
  update public.team_project_tasks set status = 'done';
  get diagnostics n = row_count;
  if n > 0 then raise exception 'Een kijker kon een projecttaak wijzigen'; end if;
  delete from public.team_projects;
  get diagnostics n = row_count;
  if n > 0 then raise exception 'Een kijker kon een project verwijderen'; end if;
  begin
    insert into public.team_projects (group_id, name) values ((select code::uuid from codes where name = 'team'), 'Nee');
    raise exception 'Een kijker kon een project maken';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.study_group_tasks (group_id, title, due_at) values ((select code::uuid from codes where name = 'team'), 'Nee', 1);
    raise exception 'Een kijker kon een groepsdeadline maken';
  exception when insufficient_privilege then null;
  end;
  -- Nobody gives themselves another role.
  begin
    update public.study_group_members set role = 'owner' where user_id = auth.uid();
    raise exception 'Een kijker kon de eigen rol wijzigen';
  exception when insufficient_privilege then null;
  end;
  -- Viewers don't see invitations.
  if exists (select 1 from public.team_invites) then raise exception 'Een kijker ziet de uitnodigingen'; end if;
end $$;
reset role;

-- 5. Roles: an admin moves members and viewers but not admins or the owner; only the owner makes admins.
set role authenticated;
set test.uid = '00000000-0000-0000-0000-0000000000a2';
select public.set_team_role(:'team', '00000000-0000-0000-0000-0000000000a3', 'viewer') \gset
select public.set_team_role(:'team', '00000000-0000-0000-0000-0000000000a3', 'member') \gset
do $$ begin
  perform public.set_team_role((select code::uuid from codes where name = 'team'), '00000000-0000-0000-0000-0000000000a3', 'admin');
  raise exception 'Een admin kon iemand admin maken';
exception when raise_exception then if sqlerrm <> 'not allowed' then raise; end if;
end $$;
do $$ begin
  perform public.remove_team_member((select code::uuid from codes where name = 'team'), '00000000-0000-0000-0000-0000000000a1');
  raise exception 'Een admin kon de eigenaar verwijderen';
exception when raise_exception then if sqlerrm <> 'not allowed' then raise; end if;
end $$;
do $$ begin
  perform public.create_team_invite((select code::uuid from codes where name = 'team'), 'admin', 24, null);
  raise exception 'Een admin kon een admin uitnodigen';
exception when raise_exception then if sqlerrm <> 'not allowed' then raise; end if;
end $$;
-- Removing the viewer takes them off the task they were assigned.
select public.remove_team_member(:'team', '00000000-0000-0000-0000-0000000000a4') \gset
do $$ begin
  if (select assignee from public.team_project_tasks where id = '00000000-0000-0000-0000-0000000000f2') is not null then
    raise exception 'Wie het team verliet, blijft toegewezen aan een taak';
  end if;
end $$;
set test.uid = '00000000-0000-0000-0000-0000000000a3';
do $$ begin
  perform public.create_team_invite((select code::uuid from codes where name = 'team'), 'member', 24, null);
  raise exception 'Een lid kon iemand uitnodigen';
exception when raise_exception then if sqlerrm <> 'not allowed' then raise; end if;
end $$;
reset role;

-- 6. The owner can't leave, but can hand the team over and then leave as an admin.
set role authenticated;
set test.uid = '00000000-0000-0000-0000-0000000000a1';
do $$ declare n bigint; begin
  delete from public.study_group_members where user_id = auth.uid();
  get diagnostics n = row_count;
  if n > 0 then raise exception 'De eigenaar kon het team gewoon verlaten'; end if;
end $$;
select public.transfer_team(:'team', '00000000-0000-0000-0000-0000000000a2') \gset
delete from public.study_group_members where user_id = '00000000-0000-0000-0000-0000000000a1';
set test.uid = '00000000-0000-0000-0000-0000000000a2';
do $$ begin
  if public.study_group_role((select code::uuid from codes where name = 'team')) <> 'owner' then raise exception 'Overdragen maakte niemand eigenaar'; end if;
end $$;
delete from public.study_groups where id = :'team';
do $$ begin
  if exists (select 1 from public.team_project_tasks where group_id = (select code::uuid from codes where name = 'team')) then raise exception 'Een verwijderd team liet taken achter'; end if;
end $$;
reset role;
