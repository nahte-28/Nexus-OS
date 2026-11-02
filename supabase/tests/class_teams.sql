-- NEXUS klasteams (20261102150000_class_teams.sql): only owner and admins open a team to a class,
-- classmates see only name and member count, and join as members. Runs after teams.sql.
\set ON_ERROR_STOP 1
reset role;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000b1', 'klas-owner@test'), ('00000000-0000-0000-0000-0000000000b2', 'klasgenoot@test'),
  ('00000000-0000-0000-0000-0000000000b3', 'andere-klas@test');

set role authenticated;
set test.uid = '00000000-0000-0000-0000-0000000000b1';
select (public.create_study_group('Klas 1IT3', 'Ethan')).id as team \gset
select set_config('test.team', :'team', false) is not null as ok \gset

-- A classmate sees nothing while the team is closed, and cannot open it.
set test.uid = '00000000-0000-0000-0000-0000000000b2';
do $$ begin
  if exists (select 1 from public.find_class_teams('1IT3')) then raise exception 'Een gesloten team was zichtbaar voor de klas'; end if;
end $$;
do $$ begin
  perform public.set_team_class(current_setting('test.team')::uuid, '1IT3', true);
  raise exception 'Iemand buiten het team opende het voor de klas';
exception when raise_exception then
  if sqlerrm <> 'not allowed' then raise; end if;
end $$;

-- The owner opens it for 1IT3 (typed loosely).
set test.uid = '00000000-0000-0000-0000-0000000000b1';
do $$ begin
  if (public.set_team_class(current_setting('test.team')::uuid, ' 1it3 ', true)).klas <> '1IT3' then
    raise exception 'De klas werd niet als 1IT3 bewaard';
  end if;
end $$;

-- The classmate finds it with name and count only, and joins as a member; once is enough.
set test.uid = '00000000-0000-0000-0000-0000000000b2';
do $$
declare r record;
begin
  select * into r from public.find_class_teams('1it3');
  if r.name <> 'Klas 1IT3' or r.members <> 1 then raise exception 'Verkeerd klasteam gevonden: %', r; end if;
  perform public.join_class_team(r.id, '1IT3', 'Remo');
  perform public.join_class_team(r.id, '1IT3', 'Remo');
  if public.study_group_role(r.id) <> 'member' then raise exception 'Een klasgenoot kreeg niet de rol lid'; end if;
  if exists (select 1 from public.find_class_teams('1IT3')) then raise exception 'Een team waar je al in zit, bleef in de lijst'; end if;
end $$;

-- Another class sees nothing and cannot join.
set test.uid = '00000000-0000-0000-0000-0000000000b3';
do $$ begin
  if exists (select 1 from public.find_class_teams('1IT4')) then raise exception 'Een andere klas zag het team'; end if;
  perform public.join_class_team(current_setting('test.team')::uuid, '1IT4', 'X');
  raise exception 'Een andere klas kon aansluiten';
exception when raise_exception then
  if sqlerrm <> 'class team closed' then raise; end if;
end $$;

-- An odd class is refused; after closing, nobody new can join.
set test.uid = '00000000-0000-0000-0000-0000000000b1';
do $$ begin
  perform public.set_team_class(current_setting('test.team')::uuid, 'niet geldig!!', true);
  raise exception 'Een rare klas werd aanvaard';
exception when raise_exception then
  if sqlerrm <> 'invalid class' then raise; end if;
end $$;
select public.set_team_class(:'team', '1IT3', false) is not null as ok \gset
set test.uid = '00000000-0000-0000-0000-0000000000b3';
do $$ begin
  perform public.join_class_team(current_setting('test.team')::uuid, '1IT3', 'X');
  raise exception 'Aansluiten lukte bij een gesloten team';
exception when raise_exception then
  if sqlerrm <> 'class team closed' then raise; end if;
end $$;
reset role;
