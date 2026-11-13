-- NEXUS Opmerkingen (20261113120000_task_comments.sql): the team comments on its project tasks and
-- group deadlines, mentions keep only members, outsiders see and write nothing.
\set ON_ERROR_STOP 1
reset role;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000a01', 'opm-owner@test'), ('00000000-0000-0000-0000-000000000a02', 'opm-lid@test'),
  ('00000000-0000-0000-0000-000000000a03', 'opm-kijker@test'), ('00000000-0000-0000-0000-000000000a04', 'opm-buiten@test');

set role authenticated;
set test.uid = '00000000-0000-0000-0000-000000000a01';
select (public.create_study_group('Opmerkingen', 'Ethan')).id as team \gset
select set_config('test.team', :'team', false) is not null as ok \gset
select (public.create_team_invite(:'team', 'member', 24, null)).code as member_code \gset
select (public.create_team_invite(:'team', 'viewer', 24, null)).code as viewer_code \gset
insert into public.team_projects (id, group_id, name) values ('00000000-0000-0000-0000-000000000b01', :'team', 'Labo');
insert into public.team_project_tasks (id, project_id, group_id, title) values ('00000000-0000-0000-0000-000000000b02', '00000000-0000-0000-0000-000000000b01', :'team', 'Verslag');
insert into public.study_group_tasks (id, group_id, title, due_at) values ('00000000-0000-0000-0000-000000000b03', :'team', 'Indienen', 9999999999999);
set test.uid = '00000000-0000-0000-0000-000000000a02';
select public.join_team(:'member_code', 'Lid') is not null as ok \gset
set test.uid = '00000000-0000-0000-0000-000000000a03';
select public.join_team(:'viewer_code', 'Kijker') is not null as ok \gset

-- 1. Comments on both kinds of task; mentions keep only other members.
set test.uid = '00000000-0000-0000-0000-000000000a02';
insert into public.team_task_comments (id, group_id, project_task_id, body, mentions) values
  ('00000000-0000-0000-0000-000000000c01', :'team', '00000000-0000-0000-0000-000000000b02', '@Ethan kijk jij dit na?',
   array['00000000-0000-0000-0000-000000000a01', '00000000-0000-0000-0000-000000000a04', '00000000-0000-0000-0000-000000000a02']::uuid[]);
set test.uid = '00000000-0000-0000-0000-000000000a03';
insert into public.team_task_comments (group_id, group_task_id, body) values (:'team', '00000000-0000-0000-0000-000000000b03', 'Ik lees mee');
do $$ declare n bigint; begin
  if (select mentions from public.team_task_comments where id = '00000000-0000-0000-0000-000000000c01') <> array['00000000-0000-0000-0000-000000000a01']::uuid[] then
    raise exception 'Vermeldingen hielden iemand buiten het team of de schrijver zelf';
  end if;
  if (select count(*) from public.team_task_comments) <> 2 then raise exception 'Het team ziet de opmerkingen niet'; end if;
  delete from public.team_task_comments where id = '00000000-0000-0000-0000-000000000c01';
  get diagnostics n = row_count;
  if n > 0 then raise exception 'Een kijker verwijderde een opmerking van een ander'; end if;
  -- Both or neither task is not a comment.
  begin
    insert into public.team_task_comments (group_id, body) values (current_setting('test.team')::uuid, 'Waarover?');
    raise exception 'Een opmerking zonder taak lukte';
  exception when check_violation or insufficient_privilege then null;
  end;
end $$;

-- 2. An outsider sees nothing and cannot comment, not even on a task of their own team.
set test.uid = '00000000-0000-0000-0000-000000000a04';
select (public.create_study_group('Ander team', 'Buiten')).id as other \gset
select set_config('test.other', :'other', false) is not null as ok \gset
do $$ begin
  if exists (select 1 from public.team_task_comments) then raise exception 'Iemand buiten het team leest de opmerkingen'; end if;
  begin
    insert into public.team_task_comments (group_id, project_task_id, body) values (current_setting('test.team')::uuid, '00000000-0000-0000-0000-000000000b02', 'Binnendringen');
    raise exception 'Iemand buiten het team schreef een opmerking';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.team_task_comments (group_id, project_task_id, body) values (current_setting('test.other')::uuid, '00000000-0000-0000-0000-000000000b02', 'Via mijn team');
    raise exception 'Een opmerking ging via een ander team naar deze taak';
  exception when insufficient_privilege then null;
  end;
end $$;

-- 3. The owner removes any comment; 30 per minute; removing the task removes its comments.
set test.uid = '00000000-0000-0000-0000-000000000a01';
delete from public.team_task_comments where id = '00000000-0000-0000-0000-000000000c01';
do $$ begin
  if exists (select 1 from public.team_task_comments where id = '00000000-0000-0000-0000-000000000c01') then raise exception 'De eigenaar kon geen opmerking verwijderen'; end if;
  for i in 1..30 loop
    insert into public.team_task_comments (group_id, group_task_id, body) values (current_setting('test.team')::uuid, '00000000-0000-0000-0000-000000000b03', 'opm ' || i);
  end loop;
  begin
    insert into public.team_task_comments (group_id, group_task_id, body) values (current_setting('test.team')::uuid, '00000000-0000-0000-0000-000000000b03', 'te veel');
    raise exception 'Er kon meer dan 30 per minuut';
  exception when raise_exception then
    if sqlerrm <> 'too many comments' then raise; end if;
  end;
end $$;
delete from public.study_group_tasks where id = '00000000-0000-0000-0000-000000000b03';
do $$ begin
  if exists (select 1 from public.team_task_comments where group_task_id is not null) then raise exception 'Opmerkingen bleven na het verwijderen van de taak'; end if;
end $$;
reset role;
