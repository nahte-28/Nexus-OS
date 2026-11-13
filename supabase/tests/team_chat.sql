-- NEXUS Teamchat (20261113090000_team_chat.sql): the team reads and writes its chat, everyone
-- removes only their own messages (managers any), outsiders see nothing, limits hold.
\set ON_ERROR_STOP 1
reset role;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000e1', 'chat-owner@test'), ('00000000-0000-0000-0000-0000000000e2', 'chat-lid@test'),
  ('00000000-0000-0000-0000-0000000000e3', 'chat-kijker@test'), ('00000000-0000-0000-0000-0000000000e4', 'chat-buiten@test');

set role authenticated;
set test.uid = '00000000-0000-0000-0000-0000000000e1';
select (public.create_study_group('Chatgroep', 'Ethan')).id as team \gset
select set_config('test.team', :'team', false) is not null as ok \gset
select (public.create_team_invite(:'team', 'member', 24, null)).code as member_code \gset
select (public.create_team_invite(:'team', 'viewer', 24, null)).code as viewer_code \gset
set test.uid = '00000000-0000-0000-0000-0000000000e2';
select public.join_team(:'member_code', 'Lid') is not null as ok \gset
set test.uid = '00000000-0000-0000-0000-0000000000e3';
select public.join_team(:'viewer_code', 'Kijker') is not null as ok \gset

-- 1. Members and viewers write; nobody writes in someone else's name or backdates.
set test.uid = '00000000-0000-0000-0000-0000000000e2';
insert into public.team_messages (id, group_id, body, created_at) values ('00000000-0000-0000-0000-0000000000f1', :'team', 'Hallo team', '2000-01-01');
set test.uid = '00000000-0000-0000-0000-0000000000e3';
insert into public.team_messages (id, group_id, body) values ('00000000-0000-0000-0000-0000000000f2', :'team', 'Ik lees mee');
do $$ begin
  insert into public.team_messages (group_id, user_id, body) values (current_setting('test.team')::uuid, '00000000-0000-0000-0000-0000000000e1', 'Nep');
  raise exception 'Iemand schreef in naam van een ander';
exception when insufficient_privilege then null;
end $$;
do $$ declare n bigint; begin
  if (select count(*) from public.team_messages) <> 2 then raise exception 'Het team ziet de chat niet'; end if;
  if (select created_at from public.team_messages where id = '00000000-0000-0000-0000-0000000000f1') < now() - interval '1 hour' then raise exception 'Een bericht kreeg een oude tijd'; end if;
  -- The viewer cannot remove the member's message.
  delete from public.team_messages where id = '00000000-0000-0000-0000-0000000000f1';
  get diagnostics n = row_count;
  if n > 0 then raise exception 'Een kijker verwijderde een bericht van een ander'; end if;
end $$;

-- 2. An outsider sees nothing and cannot write.
set test.uid = '00000000-0000-0000-0000-0000000000e4';
do $$ begin
  if exists (select 1 from public.team_messages) then raise exception 'Iemand buiten het team leest de chat'; end if;
  insert into public.team_messages (group_id, body) values (current_setting('test.team')::uuid, 'Binnendringen');
  raise exception 'Iemand buiten het team schreef in de chat';
exception when insufficient_privilege then null;
end $$;

-- 3. The owner removes any message; 30 per minute per member; leaving takes your messages along.
set test.uid = '00000000-0000-0000-0000-0000000000e1';
delete from public.team_messages where id = '00000000-0000-0000-0000-0000000000f2';
do $$ begin
  if exists (select 1 from public.team_messages where id = '00000000-0000-0000-0000-0000000000f2') then raise exception 'De eigenaar kon geen bericht verwijderen'; end if;
  for i in 1..30 loop
    insert into public.team_messages (group_id, body) values (current_setting('test.team')::uuid, 'bericht ' || i);
  end loop;
  begin
    insert into public.team_messages (group_id, body) values (current_setting('test.team')::uuid, 'te veel');
    raise exception 'Er kon meer dan 30 per minuut';
  exception when raise_exception then
    if sqlerrm <> 'too many messages' then raise; end if;
  end;
end $$;
select public.remove_team_member(:'team', '00000000-0000-0000-0000-0000000000e2') \gset
do $$ begin
  if exists (select 1 from public.team_messages where user_id = '00000000-0000-0000-0000-0000000000e2') then raise exception 'Berichten bleven na het verlaten'; end if;
end $$;

-- 4. A team keeps its last 500 messages (the old ones here come in without the trigger).
reset role;
alter table public.team_messages disable trigger team_messages_limit;
insert into public.team_messages (group_id, user_id, body, created_at)
  select :'team', '00000000-0000-0000-0000-0000000000e1', 'oud ' || i, now() - interval '1 hour' - i * interval '1 second' from generate_series(1, 520) i;
alter table public.team_messages enable trigger team_messages_limit;
set role authenticated;
set test.uid = '00000000-0000-0000-0000-0000000000e3';
insert into public.team_messages (group_id, body) values (:'team', 'nieuw');
do $$ begin
  if (select count(*) from public.team_messages where group_id = current_setting('test.team')::uuid) <> 500 then raise exception 'De chat houdt niet precies 500 berichten'; end if;
  if not exists (select 1 from public.team_messages where body = 'nieuw') then raise exception 'Het nieuwe bericht ging verloren'; end if;
end $$;
reset role;
