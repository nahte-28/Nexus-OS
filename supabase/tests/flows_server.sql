-- Flow Studio on the server (20261030090000_flows_server.sql): a flow on a fixed time that picks a
-- profile runs once, a few minutes late, only when no device ran it, and switches the profile in
-- the account. Runs as the database owner, like pg_cron.
\set ON_ERROR_STOP 1
reset role;
insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000000c', 'c@test');

-- School Mode Mon-Fri 08:30-18:00; outside it Persoonlijk.
insert into public.user_settings (user_id, key, value, revision) values ('00000000-0000-0000-0000-00000000000c', 'profiles',
  '{"defaultProfile": "personal", "returnProfile": null, "override": null, "revision": 5,
    "schedule": {"enabled": true, "profile": "school", "days": [1,2,3,4,5], "start": "08:30", "end": "18:00", "timeZone": "Europe/Brussels"}}', 5);

insert into public.automation_flows (user_id, id, name, enabled, definition, timezone, revision) values
  ('00000000-0000-0000-0000-00000000000c', 'gaming', 'Gaming om 8:30', true,
   '{"trigger": {"type": "schedule.at_time", "days": [1,2,3,4,5], "time": "08:30"}, "conditions": [],
     "actions": [{"type": "profile.activate", "profile": "gaming", "duration": "hour"}, {"type": "notification.send", "title": "Hoi", "text": "", "target": "phone"}, {"type": "app.open_prompt", "app": "notes"}]}',
   'Europe/Brussels', 1),
  ('00000000-0000-0000-0000-00000000000c', 'device', 'Al gelopen', true,
   '{"trigger": {"type": "schedule.at_time", "days": [1,2,3,4,5], "time": "08:30"}, "conditions": [], "actions": [{"type": "profile.activate", "profile": "developer", "duration": "until-change"}]}',
   'Europe/Brussels', 1),
  ('00000000-0000-0000-0000-00000000000c', 'evening', 'Alleen s avonds', true,
   '{"trigger": {"type": "schedule.at_time", "days": [1,2,3,4,5], "time": "08:30"}, "conditions": [{"type": "local_time.in_range", "start": "18:00", "end": "23:00"}], "actions": [{"type": "profile.activate", "profile": "developer", "duration": "until-change"}]}',
   'Europe/Brussels', 1),
  ('00000000-0000-0000-0000-00000000000c', 'online', 'Device-voorwaarde', true,
   '{"trigger": {"type": "schedule.at_time", "days": [1,2,3,4,5], "time": "08:30"}, "conditions": [{"type": "network.online"}], "actions": [{"type": "profile.activate", "profile": "developer", "duration": "until-change"}]}',
   'Europe/Brussels', 1);

-- A pc that was open already ran "Al gelopen" for this Friday.
insert into public.automation_runs (id, user_id, flow_id, flow_name, event_id, trigger_type, status, steps, started_at)
  values (gen_random_uuid(), '00000000-0000-0000-0000-00000000000c', 'device', 'Al gelopen', 'at:2026-10-30', 'schedule.at_time', 'ok', '[]', now());

do $$
declare
  n int;
  s jsonb;
  r record;
begin
  -- 08:31 on Friday: too soon, an open device gets the first chance.
  n := nexus_private.run_flows('2026-10-30 08:31 Europe/Brussels');
  if n <> 0 then raise exception 'De server liep een flow voor de wachttijd voorbij was (%)', n; end if;

  -- 08:34: only "Gaming om 8:30" runs.
  n := nexus_private.run_flows('2026-10-30 08:34 Europe/Brussels');
  if n <> 1 then raise exception 'Verwacht 1 run om 08:34, kreeg %', n; end if;
  select value, revision into s, n from public.user_settings where user_id = '00000000-0000-0000-0000-00000000000c' and key = 'profiles';
  if n <> 6 or (s ->> 'revision')::int <> 6 then raise exception 'De revisie van de profielen ging niet omhoog: %', n; end if;
  if s -> 'override' ->> 'profile' <> 'gaming' or s -> 'override' ->> 'mode' <> 'until-time' or (s -> 'override' ->> 'windowOpenAtStart')::boolean is not true
     or (s -> 'override' ->> 'until')::bigint <> floor(extract(epoch from timestamptz '2026-10-30 09:34 Europe/Brussels') * 1000)::bigint then
    raise exception 'Verkeerde profielkeuze: %', s -> 'override';
  end if;
  select * into r from public.automation_runs where flow_id = 'gaming';
  if r.status <> 'ok' or r.device_name <> 'NEXUS-server' or r.event_id <> 'at:2026-10-30' or jsonb_array_length(r.steps) <> 3
     or r.steps -> 1 ->> 'status' <> 'skipped' then
    raise exception 'Verkeerde run: % %', r.status, r.steps;
  end if;
  if exists (select 1 from public.automation_runs where flow_id in ('evening', 'online')) then
    raise exception 'Een flow met een voorwaarde die niet klopt of die de server niet kan nagaan, liep toch';
  end if;

  -- Once per event, and nothing after the 30 minutes of catch-up.
  if nexus_private.run_flows('2026-10-30 08:40 Europe/Brussels') <> 0 then raise exception 'Dezelfde gebeurtenis liep twee keer'; end if;
  delete from public.automation_runs where flow_id = 'gaming';
  if nexus_private.run_flows('2026-10-30 09:05 Europe/Brussels') <> 0 then raise exception 'Een flow liep meer dan 30 minuten te laat'; end if;

  -- Saturday is not one of its days; and pause-all stops the server too.
  if nexus_private.run_flows('2026-10-31 08:34 Europe/Brussels') <> 0 then raise exception 'Een flow liep op een verkeerde dag'; end if;
  insert into public.user_settings (user_id, key, value, revision) values ('00000000-0000-0000-0000-00000000000c', 'flows', '{"paused": true}', 1);
  if nexus_private.run_flows('2026-11-02 08:34 Europe/Brussels') <> 0 then raise exception 'Een flow liep terwijl alles gepauzeerd was'; end if;
end $$;

-- Users cannot start server runs themselves; they can ask whether it is set up.
set role authenticated;
set test.uid = '00000000-0000-0000-0000-00000000000c';
do $$ begin
  perform nexus_private.run_flows();
  raise exception 'Een gebruiker kon run_flows aanroepen';
exception when insufficient_privilege then null;
end $$;
do $$ begin
  if (public.flows_server_status() ->> 'scheduled')::boolean is not true then raise exception 'De serverplanning ontbreekt'; end if;
end $$;
reset role;
