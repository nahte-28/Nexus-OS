-- NEXUS Wie is er online (20261113210000_presence.sql): only friends and teammates see you,
-- invisible looks offline, and nobody writes or reads another person's row directly.
\set ON_ERROR_STOP 1
reset role;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000c21', 'online-a@test'), ('00000000-0000-0000-0000-000000000c22', 'online-vriend@test'),
  ('00000000-0000-0000-0000-000000000c23', 'online-team@test'), ('00000000-0000-0000-0000-000000000c24', 'online-vreemde@test');
insert into public.friendships (requester, addressee, status, accepted_at) values
  ('00000000-0000-0000-0000-000000000c21', '00000000-0000-0000-0000-000000000c22', 'accepted', now());
insert into public.study_groups (id, name, invite_code, created_by) values ('00000000-0000-0000-0000-00000000c2a0', 'Online-team', 'WNLNTEAM', '00000000-0000-0000-0000-000000000c21');
insert into public.study_group_members (group_id, user_id, display_name) values
  ('00000000-0000-0000-0000-00000000c2a0', '00000000-0000-0000-0000-000000000c21', 'A'),
  ('00000000-0000-0000-0000-00000000c2a0', '00000000-0000-0000-0000-000000000c23', 'T');

set role authenticated;
set test.uid = '00000000-0000-0000-0000-000000000c22';
select public.set_presence('busy', '  Aan het studeren  ');
set test.uid = '00000000-0000-0000-0000-000000000c23';
select public.presence_ping();
set test.uid = '00000000-0000-0000-0000-000000000c24';
select public.presence_ping();
do $$ begin
  if exists (select 1 from public.presence_list()) then raise exception 'Een vreemde ziet wie er online is'; end if;
  if (select count(*) from public.user_presence) <> 1 then raise exception 'Je ziet de rij van iemand anders'; end if;
  begin
    update public.user_presence set state = 'busy';
    raise exception 'Rechtstreeks schrijven lukte';
  exception when insufficient_privilege then null;
  end;
end $$;

set test.uid = '00000000-0000-0000-0000-000000000c21';
do $$ begin
  if (select string_agg(user_id::text || ':' || state, ',' order by user_id) from public.presence_list())
     <> '00000000-0000-0000-0000-000000000c22:busy,00000000-0000-0000-0000-000000000c23:available' then
    raise exception 'Vrienden en teamgenoten kloppen niet';
  end if;
  if (select note from public.presence_list() where user_id = '00000000-0000-0000-0000-000000000c22') <> 'Aan het studeren' then raise exception 'De status is niet bijgesneden'; end if;
end $$;

set test.uid = '00000000-0000-0000-0000-000000000c22';
select public.set_presence('invisible', 'geheim');
do $$ begin
  begin
    perform public.set_presence('weg', null);
    raise exception 'Een onbekende status lukte';
  exception when check_violation then null;
  end;
end $$;
set test.uid = '00000000-0000-0000-0000-000000000c21';
do $$ begin
  if (select state || coalesce(note, '') || coalesce(last_seen::text, '') from public.presence_list() where user_id = '00000000-0000-0000-0000-000000000c22') <> 'offline' then
    raise exception 'Onzichtbaar verraadt iets';
  end if;
end $$;
reset role;
