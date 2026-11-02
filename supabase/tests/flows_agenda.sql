-- Flows on the server follow the timetable (20261102120000_flows_server_agenda.sql): the same
-- lessons, lead time and breaks as agendaPhase in packages/core/src/profiles.ts.
\set ON_ERROR_STOP 1
reset role;
set timezone = 'Europe/Brussels';
insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000000d', 'd@test');

-- No hours schedule; School from 10 minutes before a lesson, breaks up to an hour bridged.
-- Monday: Wiskunde 08:30-10:30 (also in the school calendar) and Netwerken 11:00-12:30.
-- Tuesday 3 November: Labo 13:00-15:00, only in the school calendar.
insert into public.user_settings (user_id, key, value, revision) values ('00000000-0000-0000-0000-00000000000d', 'profiles',
  jsonb_build_object(
    'defaultProfile', 'personal', 'returnProfile', null, 'override', null, 'revision', 3,
    'schedule', jsonb_build_object('enabled', false, 'profile', 'school', 'days', '[1,2,3,4,5]'::jsonb, 'start', '08:30', 'end', '18:00', 'timeZone', 'Europe/Brussels'),
    'agenda', jsonb_build_object('enabled', true, 'profile', 'school', 'leadMinutes', 10, 'bridgeMinutes', 60),
    'lessons', '[{"day": 1, "start": "08:30", "end": "10:30", "subject": "Wiskunde"}, {"day": 1, "start": "11:00", "end": "12:30", "subject": "Netwerken"}]'::jsonb,
    'calendarEvents', jsonb_build_array(
      jsonb_build_object('start', floor(extract(epoch from timestamptz '2026-11-02 08:30 Europe/Brussels') * 1000), 'end', floor(extract(epoch from timestamptz '2026-11-02 10:30 Europe/Brussels') * 1000), 'subject', 'wiskunde'),
      jsonb_build_object('start', floor(extract(epoch from timestamptz '2026-11-03 13:00 Europe/Brussels') * 1000), 'end', floor(extract(epoch from timestamptz '2026-11-03 15:00 Europe/Brussels') * 1000), 'subject', 'Labo'))
  ), 3);

insert into public.automation_flows (user_id, id, name, enabled, definition, timezone, revision) values
  ('00000000-0000-0000-0000-00000000000d', 'lunch', 'Lunch', true,
   '{"trigger": {"type": "schedule.at_time", "days": [1], "time": "12:00"}, "conditions": [{"type": "profile.is_active", "profile": "school"}],
     "actions": [{"type": "profile.activate", "profile": "gaming", "duration": "until-change"}]}', 'Europe/Brussels', 1),
  ('00000000-0000-0000-0000-00000000000d', 'early', 'Vroeg', true,
   '{"trigger": {"type": "schedule.at_time", "days": [1], "time": "08:00"}, "conditions": [{"type": "profile.is_active", "profile": "school"}],
     "actions": [{"type": "profile.activate", "profile": "developer", "duration": "until-change"}]}', 'Europe/Brussels', 1);

do $$
declare
  s jsonb;
  n int;
  t timestamptz;
begin
  select value into s from public.user_settings where user_id = '00000000-0000-0000-0000-00000000000d' and key = 'profiles';

  -- The lesson in both the timetable and the school calendar counts once.
  select count(*) into n from nexus_private.lesson_blocks(s, '2026-11-02 09:00 Europe/Brussels');
  if n <> 2 then raise exception 'Verwacht 2 lessen rond maandag 09:00, kreeg %', n; end if;

  -- Before, during and between lessons; not too early and not after the last one.
  foreach t in array array['2026-11-02 08:19', '2026-11-02 12:30', '2026-11-03 12:49', '2026-11-03 15:00']::timestamptz[] loop
    if nexus_private.agenda_open(s, t) then raise exception 'Lesrooster stond open om %', t; end if;
  end loop;
  foreach t in array array['2026-11-02 08:20', '2026-11-02 09:00', '2026-11-02 10:45', '2026-11-02 12:29', '2026-11-03 12:50', '2026-11-03 14:59']::timestamptz[] loop
    if not nexus_private.agenda_open(s, t) then raise exception 'Lesrooster stond dicht om %', t; end if;
  end loop;
  if nexus_private.agenda_open(jsonb_set(s, '{agenda,bridgeMinutes}', '15'), '2026-11-02 10:45') then
    raise exception 'Een pauze van 30 minuten werd overbrugd met een grens van 15';
  end if;
  if nexus_private.agenda_open(jsonb_set(s, '{agenda,enabled}', 'false'), '2026-11-02 09:00') then
    raise exception 'Lesrooster stond open terwijl het uit stond';
  end if;
  if nexus_private.active_profile(s, '2026-11-02 09:00') <> 'school' or nexus_private.active_profile(s, '2026-11-02 13:00') <> 'personal' then
    raise exception 'Verkeerd actief profiel volgens het lesrooster';
  end if;
  -- The hours schedule goes first.
  if nexus_private.active_profile(jsonb_set(jsonb_set(s, '{schedule,enabled}', 'true'), '{schedule,profile}', '"developer"'), '2026-11-02 09:00') <> 'developer' then
    raise exception 'Het uurschema ging niet voor';
  end if;

  -- 08:03: "Vroeg" does not run, nobody is in a lesson at 08:00.
  n := nexus_private.run_flows('2026-11-02 08:03 Europe/Brussels');
  if n <> 0 then raise exception 'Vroeg liep terwijl School niet actief was (%)', n; end if;

  -- 12:03: "Lunch" runs, School is active during Netwerken; Gaming holds while the lesson runs.
  n := nexus_private.run_flows('2026-11-02 12:03 Europe/Brussels');
  if n <> 1 then raise exception 'Verwacht 1 run om 12:03, kreeg %', n; end if;
  select value into s from public.user_settings where user_id = '00000000-0000-0000-0000-00000000000d' and key = 'profiles';
  if s -> 'override' ->> 'profile' <> 'gaming' or (s -> 'override' ->> 'windowOpenAtStart')::boolean is not true or s -> 'override' ->> 'by' <> 'flow Lunch' then
    raise exception 'Verkeerde profielkeuze: %', s -> 'override';
  end if;
  if nexus_private.active_profile(s, '2026-11-02 12:20') <> 'gaming' then raise exception 'Gaming hield niet tijdens de les'; end if;
  -- After the last lesson the choice ends, like on the devices, and Persoonlijk is back.
  if nexus_private.active_profile(s, '2026-11-02 12:40') <> 'personal' then raise exception 'De keuze bleef na de les'; end if;
end $$;

-- What the server sees, for Profielen; only your own profiles.
set role authenticated;
set test.uid = '00000000-0000-0000-0000-00000000000d';
do $$
declare
  v jsonb := public.profiles_server_view();
begin
  if (v ->> 'profiles')::boolean is not true or (v ->> 'agenda')::boolean is not true or v ->> 'active' is null or v -> 'lessonNow' is null then
    raise exception 'Verkeerd antwoord van profiles_server_view: %', v;
  end if;
end $$;
set test.uid = '00000000-0000-0000-0000-00000000000e';
do $$ begin
  if (public.profiles_server_view() ->> 'profiles')::boolean is not false then raise exception 'Iemand anders zag deze profielen'; end if;
end $$;
reset role;
reset timezone;
