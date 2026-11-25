-- NEXUS Agenda in Google (20261125090000_agenda_feed.sql): alleen jij ziet en wijzigt je eigen link;
-- zonder login geeft de geheime code alleen de .ics-tekst, een verkeerde code niets.
\set ON_ERROR_STOP 1
reset role;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000f01', 'af-a@test'), ('00000000-0000-0000-0000-000000000f02', 'af-b@test');
set role authenticated;
set test.uid = '00000000-0000-0000-0000-000000000f01';
insert into public.agenda_feeds (token, ics) values ('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'BEGIN:VCALENDAR');
set test.uid = '00000000-0000-0000-0000-000000000f02';
do $$ begin
  if exists (select 1 from public.agenda_feeds) then raise exception 'B ziet de link van A'; end if;
end $$;
update public.agenda_feeds set ics = 'gehackt';
delete from public.agenda_feeds;
do $$ begin
  begin
    insert into public.agenda_feeds (user_id, token, ics) values ('00000000-0000-0000-0000-000000000f01', 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', 'x');
    raise exception 'B maakte een link voor A';
  exception when insufficient_privilege then null;
  end;
end $$;
set role anon;
do $$ begin
  if public.agenda_feed('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa') is distinct from 'BEGIN:VCALENDAR' then raise exception 'Google krijgt de agenda niet'; end if;
  if public.agenda_feed('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaab') is not null then raise exception 'Verkeerde code gaf iets terug'; end if;
  if public.agenda_feed('%') is not null then raise exception 'Patroon gaf iets terug'; end if;
end $$;
do $$ begin
  begin
    if exists (select 1 from public.agenda_feeds) then raise exception 'anon leest de tabel'; end if;
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
-- A's link is ongewijzigd na B's pogingen.
do $$ begin
  if (select ics from public.agenda_feeds where user_id = '00000000-0000-0000-0000-000000000f01') <> 'BEGIN:VCALENDAR' then raise exception 'B wijzigde de link van A'; end if;
end $$;
