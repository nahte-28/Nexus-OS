-- NEXUS flows on the server follow the timetable (Profiles 2.0, "Volgens je lesrooster"): the
-- server now knows the same lessons as the devices (the school calendar and the weekly Lesrooster
-- in the synced profiles), so a profile picked by a flow while NEXUS is closed everywhere stays
-- right when a device opens, and the condition "Profiel is actief" also works on the server.
-- Run after 20261030090000_flows_server.sql. The logic mirrors packages/core/src/profiles.ts.

-- Like lessonBlocks: the lessons from yesterday to tomorrow around [at], sorted. A weekly lesson
-- the school calendar already has (same subject, same minute) counts once.
create or replace function nexus_private.lesson_blocks(state jsonb, at timestamptz)
returns table (start_ms bigint, end_ms bigint, subject text)
language plpgsql stable as $$
declare
  at_ms bigint := floor(extract(epoch from at) * 1000)::bigint;
  blocks jsonb := '[]'::jsonb;
  p record;
  o int;
  d int;
  l jsonb;
  s bigint;
  e bigint;
begin
  if jsonb_typeof(state -> 'calendarEvents') = 'array' then
    select coalesce(jsonb_agg(jsonb_build_object('s', round((ev ->> 'start')::numeric), 'e', round((ev ->> 'end')::numeric), 'n', ev ->> 'subject')), '[]'::jsonb)
      into blocks
      from jsonb_array_elements(state -> 'calendarEvents') ev
     where jsonb_typeof(ev -> 'start') = 'number' and jsonb_typeof(ev -> 'end') = 'number' and jsonb_typeof(ev -> 'subject') = 'string'
       and (ev ->> 'end')::numeric > at_ms - 86400000 and (ev ->> 'start')::numeric < at_ms + 86400000;
  end if;
  if jsonb_typeof(state -> 'lessons') = 'array' then
    select * into p from nexus_private.local_parts(at, coalesce(nullif(state -> 'schedule' ->> 'timeZone', ''), 'Europe/Brussels'));
    foreach o in array array[-1, 0, 1] loop
      d := ((p.day - 1 + o + 7) % 7) + 1;
      for l in select * from jsonb_array_elements(state -> 'lessons') loop
        continue when coalesce(jsonb_typeof(l -> 'day'), '') <> 'number' or (l ->> 'day')::numeric <> d
          or coalesce(jsonb_typeof(l -> 'subject'), '') <> 'string'
          or nexus_private.hm(l ->> 'start') is null or nexus_private.hm(l ->> 'end') is null;
        -- Minutes from now, like on the devices.
        s := at_ms + (o * 1440 + nexus_private.hm(l ->> 'start') - p.minutes)::bigint * 60000;
        e := at_ms + (o * 1440 + nexus_private.hm(l ->> 'end') - p.minutes)::bigint * 60000;
        continue when e <= s;
        continue when exists (select 1 from jsonb_array_elements(blocks) b
                               where abs((b ->> 's')::bigint - s) < 60000 and lower(b ->> 'n') = lower(l ->> 'subject'));
        blocks := blocks || jsonb_build_object('s', s, 'e', e, 'n', l ->> 'subject');
      end loop;
    end loop;
  end if;
  return query select (b ->> 's')::bigint, (b ->> 'e')::bigint, b ->> 'n'
                 from jsonb_array_elements(blocks) with ordinality x(b, i) order by 1, i;
end;
$$;

-- Like parseAgendaRule: the profile of the agenda rule, School when it is missing or unknown.
create or replace function nexus_private.agenda_profile(state jsonb) returns text
language sql immutable as $$
  select case when state -> 'agenda' ->> 'profile' in ('school', 'personal', 'gaming', 'developer') then state -> 'agenda' ->> 'profile' else 'school' end
$$;

-- Like agendaPhase: whether the agenda rule holds at [at] (during a lesson, [leadMinutes] before
-- one, or in a break between two lessons up to [bridgeMinutes]).
create or replace function nexus_private.agenda_open(state jsonb, at timestamptz) returns boolean
language plpgsql stable as $$
declare
  rule jsonb := state -> 'agenda';
  at_ms bigint := floor(extract(epoch from at) * 1000)::bigint;
  lead_min int;
  bridge_min int;
  prev_end bigint;
  next_start bigint;
  b record;
begin
  if coalesce(rule -> 'enabled', 'false'::jsonb) <> 'true'::jsonb then
    return false;
  end if;
  lead_min := case when rule ->> 'leadMinutes' in ('0', '5', '10', '15', '30') then (rule ->> 'leadMinutes')::int else 10 end;
  bridge_min := case when rule ->> 'bridgeMinutes' in ('0', '15', '30', '60', '120') then (rule ->> 'bridgeMinutes')::int else 60 end;
  for b in select * from nexus_private.lesson_blocks(state, at) loop
    if b.start_ms <= at_ms and at_ms < b.end_ms then
      return true;
    end if;
    if b.start_ms > at_ms then
      if b.start_ms - lead_min * 60000 <= at_ms then
        return true;
      end if;
      next_start := coalesce(next_start, b.start_ms);
    end if;
    if b.end_ms <= at_ms then
      prev_end := b.end_ms;
    end if;
  end loop;
  if bridge_min > 0 and prev_end is not null and next_start is not null and next_start - prev_end <= bridge_min * 60000 then
    return true;
  end if;
  return false;
end;
$$;

-- Like activeProfile: the profile that applies at [at]. A choice holds until its time, until you
-- switch back, or (the usual one) until the automatic window it was made in opens or closes.
create or replace function nexus_private.active_profile(state jsonb, at timestamptz) returns text
language plpgsql stable as $$
declare
  hours boolean := nexus_private.window_open(state -> 'schedule', at);
  agenda boolean := not hours and nexus_private.agenda_open(state, at);
  o jsonb := state -> 'override';
begin
  if jsonb_typeof(o) = 'object' and o ->> 'profile' in ('school', 'personal', 'gaming', 'developer') and (
       o ->> 'mode' = 'until-manual'
    or (o ->> 'mode' = 'until-time' and jsonb_typeof(o -> 'until') = 'number' and extract(epoch from at) * 1000 < (o ->> 'until')::numeric)
    or (o ->> 'mode' = 'until-change' and o -> 'windowOpenAtStart' = to_jsonb(hours or agenda))) then
    return o ->> 'profile';
  end if;
  if hours then
    return state -> 'schedule' ->> 'profile';
  end if;
  if agenda then
    return nexus_private.agenda_profile(state);
  end if;
  return coalesce(state ->> 'returnProfile', state ->> 'defaultProfile', 'personal');
end;
$$;

-- Like chooseProfile: the automatic window is now the hours schedule or the timetable, so a flow
-- that picks a profile during a lesson keeps it until the lesson ends, as on the devices. [by_name]
-- shows in Profielen as "Gekozen door ...". The caller bumps the revision.
drop function if exists nexus_private.choose_profile(jsonb, text, timestamptz, text, bigint);
create or replace function nexus_private.choose_profile(state jsonb, profile text, at timestamptz, mode text, until_ms bigint, by_name text default null)
returns jsonb language plpgsql stable as $$
declare
  hours boolean := nexus_private.window_open(state -> 'schedule', at);
  open boolean := hours or nexus_private.agenda_open(state, at);
  ret jsonb;
  scheduled text;
  ov jsonb;
begin
  if open or mode <> 'until-change' then
    ret := coalesce(state -> 'returnProfile', 'null'::jsonb);
  elsif profile = state ->> 'defaultProfile' then
    ret := 'null'::jsonb;
  else
    ret := to_jsonb(profile);
  end if;
  scheduled := case when hours then state -> 'schedule' ->> 'profile'
                    when open then nexus_private.agenda_profile(state)
                    else coalesce(ret #>> '{}', state ->> 'defaultProfile') end;
  if mode = 'until-change' and profile = scheduled then
    ov := 'null'::jsonb;
  else
    ov := jsonb_build_object('profile', profile, 'mode', mode, 'windowOpenAtStart', open, 'setAt', floor(extract(epoch from at) * 1000)::bigint);
    if mode = 'until-time' and until_ms is not null then
      ov := ov || jsonb_build_object('until', until_ms);
    end if;
    if nullif(by_name, '') is not null then
      ov := ov || jsonb_build_object('by', left(by_name, 60));
    end if;
  end if;
  return state || jsonb_build_object('override', ov, 'returnProfile', ret);
end;
$$;

-- Runs the flows that are due at [at] and that no device ran. Waits [grace] after the flow's
-- time, so a device that is open runs it itself (it checks every 30 seconds); runs nothing older
-- than 30 minutes, like the devices' catch-up. Returns how many runs it did.
create or replace function nexus_private.run_flows(at timestamptz default now(), grace int default 3) returns integer
language plpgsql security definer set search_path = public, nexus_private as $$
declare
  f record;
  def jsonb;
  tz text;
  p record;
  late int;
  run_id uuid;
  act jsonb;
  results jsonb;
  state jsonb;
  rev bigint;
  until_ms bigint;
  current_state jsonb;
  done integer := 0;
begin
  for f in
    select af.user_id, af.id, af.name, af.definition, af.timezone
      from public.automation_flows af
     where af.enabled
       and af.deleted_at is null
       and af.definition -> 'trigger' ->> 'type' = 'schedule.at_time'
       and jsonb_path_exists(af.definition, '$.actions[*] ? (@.type == "profile.activate")')
       and not jsonb_path_exists(af.definition, '$.conditions[*] ? (@.type != "local_time.in_range" && @.type != "profile.is_active")')
       and not exists (select 1 from public.user_settings us
                        where us.user_id = af.user_id and us.key = 'flows' and us.value ->> 'paused' = 'true')
  loop
    begin
      def := f.definition;
      tz := coalesce(nullif(f.timezone, ''), nullif(def ->> 'timeZone', ''), 'Europe/Brussels');
      select * into p from nexus_private.local_parts(at, tz);
      late := p.minutes - nexus_private.hm(def -> 'trigger' ->> 'time');
      continue when late is null or late < grace or late > 30 or not ((def -> 'trigger' -> 'days') @> to_jsonb(p.day));
      continue when exists (select 1 from jsonb_array_elements(def -> 'conditions') c
                             where c ->> 'type' = 'local_time.in_range' and not nexus_private.in_range(c ->> 'start', c ->> 'end', p.minutes));
      -- "Profiel is actief" is judged at the flow's own time, like on a device, with the hours
      -- schedule, the timetable (agenda rule) and any choice that still holds.
      if jsonb_path_exists(def, '$.conditions[*] ? (@.type == "profile.is_active")') then
        select value into current_state from public.user_settings where user_id = f.user_id and key = 'profiles';
        continue when current_state is null;
        continue when exists (select 1 from jsonb_array_elements(def -> 'conditions') c
                               where c ->> 'type' = 'profile.is_active'
                                 and c ->> 'profile' is distinct from nexus_private.active_profile(current_state, at - make_interval(mins => late)));
      end if;

      -- The same event id as on the devices (triggerEvents in flows.ts): whoever claims it first runs it.
      insert into public.automation_runs (id, user_id, flow_id, flow_name, event_id, trigger_type, status, manual, device_name, steps, started_at)
        values (gen_random_uuid(), f.user_id, f.id, left(f.name, 200), 'at:' || p.date, 'schedule.at_time', 'running', false, 'NEXUS-server', '[]', at)
        on conflict (user_id, flow_id, event_id) do nothing
        returning id into run_id;
      continue when run_id is null;

      select value, revision into state, rev from public.user_settings where user_id = f.user_id and key = 'profiles' for update;
      results := '[]'::jsonb;
      for act in select * from jsonb_array_elements(def -> 'actions') loop
        if act ->> 'type' = 'profile.activate' then
          if state is null or act ->> 'profile' not in ('school', 'personal', 'gaming', 'developer') then
            results := results || jsonb_build_object('type', 'profile.activate', 'status', 'failed', 'detail', 'Je profielen staan nog niet in je account');
            continue;
          end if;
          until_ms := case act ->> 'duration'
            when 'hour' then floor(extract(epoch from at + interval '1 hour') * 1000)::bigint
            when 'today' then floor(extract(epoch from ((date_trunc('day', at at time zone tz) + interval '1 day') at time zone tz)) * 1000)::bigint
          end;
          state := nexus_private.choose_profile(state, act ->> 'profile', at, case when until_ms is null then 'until-change' else 'until-time' end, until_ms, 'flow ' || f.name);
          results := results || jsonb_build_object('type', 'profile.activate', 'status', 'ok');
        elsif act ->> 'type' = 'notification.send' and act ->> 'target' = 'phone' then
          results := results || jsonb_build_object('type', 'notification.send', 'status', 'skipped', 'detail', 'Via het vangnet van je gsm');
        else
          results := results || jsonb_build_object('type', act ->> 'type', 'status', 'skipped', 'detail', 'Er stond geen NEXUS open');
        end if;
      end loop;

      if state is not null and jsonb_path_exists(results, '$[*] ? (@.type == "profile.activate" && @.status == "ok")') then
        update public.user_settings
           set value = state || jsonb_build_object('revision', rev + 1), revision = rev + 1
         where user_id = f.user_id and key = 'profiles';
      end if;
      update public.automation_runs
         set status = case when jsonb_path_exists(results, '$[*] ? (@.status == "failed")') then 'failed' else 'ok' end,
             steps = results, completed_at = at
       where id = run_id;
      done := done + 1;
    exception when others then
      -- One broken flow (an unknown time zone, say) never stops the others.
      raise warning 'Flow % kon niet lopen: %', f.id, sqlerrm;
    end;
  end loop;
  return done;
end;
$$;

revoke all on function nexus_private.run_flows(timestamptz, int) from public, anon, authenticated;

-- For Profielen and the Database-check: what the server sees in your synced profiles right now,
-- so you can check that it follows your timetable. Only your own profiles.
create or replace function public.profiles_server_view() returns jsonb
language plpgsql stable security definer set search_path = public, pg_catalog as $$
declare
  s jsonb;
begin
  select value into s from public.user_settings where user_id = auth.uid() and key = 'profiles';
  if s is null then
    return jsonb_build_object('profiles', false);
  end if;
  return jsonb_build_object(
    'profiles', true,
    'agenda', coalesce(s -> 'agenda' -> 'enabled' = 'true'::jsonb, false),
    'lessonNow', nexus_private.agenda_open(s, now()),
    'active', nexus_private.active_profile(s, now())
  );
end;
$$;
revoke all on function public.profiles_server_view() from public;
grant execute on function public.profiles_server_view() to authenticated;
