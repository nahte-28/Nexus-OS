-- NEXUS Teams (20261120090000_task_assigned_push.sql): a task someone else puts on your name wakes
-- your phones once; your own tasks, unchanged assignees and a switched-off Teamchat stay quiet.
\set ON_ERROR_STOP 1
reset role;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000e01', 'tp-a@test'), ('00000000-0000-0000-0000-000000000e02', 'tp-b@test');
set role authenticated;
set test.uid = '00000000-0000-0000-0000-000000000e01';
select (public.create_study_group('Taakteam', 'Anna')).id as team \gset
select (public.create_team_invite(:'team', 'member', 24, null)).code as code \gset
set test.uid = '00000000-0000-0000-0000-000000000e02';
select public.join_team(:'code', 'Bram') is not null as ok \gset
reset role;
insert into public.devices (id, user_id, name, platform, public_key)
  values ('00000000-0000-0000-0000-00000000de02', '00000000-0000-0000-0000-000000000e02', 'Gsm', 'web', repeat('k', 88));
insert into public.push_subscriptions (device_id, user_id, endpoint, p256dh, auth)
  values ('00000000-0000-0000-0000-00000000de02', '00000000-0000-0000-0000-000000000e02', 'https://push.test/tp', 'p', 'a');

set role authenticated;
set test.uid = '00000000-0000-0000-0000-000000000e01';
insert into public.team_projects (id, group_id, name) values ('00000000-0000-0000-0000-00000000ef01', :'team', 'Labo');
insert into public.team_project_tasks (id, project_id, group_id, title, assignee) values
  ('00000000-0000-0000-0000-00000000ef02', '00000000-0000-0000-0000-00000000ef01', :'team', 'Verslag', '00000000-0000-0000-0000-000000000e02'),
  ('00000000-0000-0000-0000-00000000ef03', '00000000-0000-0000-0000-00000000ef01', :'team', 'Eigen taak', '00000000-0000-0000-0000-000000000e01');
update public.team_project_tasks set status = 'doing' where id = '00000000-0000-0000-0000-00000000ef02';
reset role;
do $$ begin
  if (select count(*) from public.push_schedule where ref like 'team-task:%') <> 1 then
    raise exception 'Niet precies één melding: %', (select jsonb_agg(s.ref) from public.push_schedule s where ref like 'team-task:%');
  end if;
  if (select extra ->> 'text' from public.push_schedule where ref like 'team-task:%') <> 'Anna zette "Verslag" (Labo) op jouw naam.' then
    raise exception 'Verkeerde tekst: %', (select extra from public.push_schedule where ref like 'team-task:%');
  end if;
end $$;

-- With Teamchat off, no notice.
insert into public.message_push (user_id, dm, team) values ('00000000-0000-0000-0000-000000000e02', true, false);
set role authenticated;
set test.uid = '00000000-0000-0000-0000-000000000e01';
update public.team_project_tasks set assignee = '00000000-0000-0000-0000-000000000e02' where id = '00000000-0000-0000-0000-00000000ef03';
reset role;
do $$ begin
  if (select count(*) from public.push_schedule where ref like 'team-task:%') <> 1 then raise exception 'Melding ondanks Teamchat uit'; end if;
end $$;
