-- NEXUS Flow Studio on the server: a flow on a fixed time that picks a profile ("School Start")
-- also runs when NEXUS is closed everywhere. Every minute the database looks for such flows that
-- no device ran yet, a few minutes after their time, and switches the profile in the account.
-- Open devices follow through the normal sync. Notifications are not sent from here: what goes to
-- the phone was planned ahead by a device (the safety net), and the server never sees it.
--
-- Only flows that the server can judge on its own run here: trigger "Op een vast tijdstip", at
-- least one "Profiel activeren", and as conditions only "Tussen twee uren". A flow without a time
-- zone counts as Europe/Brussels.

create schema if not exists nexus_private;
revoke all on schema nexus_private from public, anon, authenticated;

-- HH:MM as minutes since midnight; null when it is not a time.
create or replace function nexus_private.hm(t text) returns integer
language sql immutable as $$
  select case when t ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then split_part(t, ':', 1)::int * 60 + split_part(t, ':', 2)::int end
$$;

-- Weekday (1 = Monday), minutes since midnight and date of [at] on the wall clock of [tz].
create or replace function nexus_private.local_parts(at timestamptz, tz text, out day int, out minutes int, out date text)
language sql stable as $$
  select extract(isodow from l)::int, (extract(hour from l) * 60 + extract(minute from l))::int, to_char(l, 'YYYY-MM-DD')
    from (select at at time zone tz as l) x
$$;

-- Like inRange in packages/core/src/flows.ts: an end before the start runs past midnight.
create or replace function nexus_private.in_range(start_t text, end_t text, m int) returns boolean
language sql immutable as $$
  select case when nexus_private.hm(start_t) is null or nexus_private.hm(end_t) is null then false
              when nexus_private.hm(start_t) <= nexus_private.hm(end_t) then m >= nexus_private.hm(start_t) and m < nexus_private.hm(end_t)
              else m >= nexus_private.hm(start_t) or m < nexus_private.hm(end_t) end
$$;

-- Like isWindowOpen in packages/core/src/profiles.ts: whether School Mode's window is open.
create or replace function nexus_private.window_open(schedule jsonb, at timestamptz) returns boolean
language plpgsql stable as $$
declare
  s int := nexus_private.hm(schedule ->> 'start');
  e int := nexus_private.hm(schedule ->> 'end');
  p record;
  yesterday int;
begin
  if coalesce((schedule ->> 'enabled')::boolean, false) is false or s is null or e is null or s = e then
    return false;
  end if;
  select * into p from nexus_private.local_parts(at, coalesce(nullif(schedule ->> 'timeZone', ''), 'Europe/Brussels'));
  if s < e then
    return (schedule -> 'days') @> to_jsonb(p.day) and p.minutes >= s and p.minutes < e;
  end if;
  yesterday := case when p.day = 1 then 7 else p.day - 1 end;
  return ((schedule -> 'days') @> to_jsonb(p.day) and p.minutes >= s) or ((schedule -> 'days') @> to_jsonb(yesterday) and p.minutes < e);
end;
$$;

-- Like chooseProfile in packages/core/src/profiles.ts; the caller bumps the revision.
create or replace function nexus_private.choose_profile(state jsonb, profile text, at timestamptz, mode text, until_ms bigint)
returns jsonb language plpgsql stable as $$
declare
  open boolean := nexus_private.window_open(state -> 'schedule', at);
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
  scheduled := case when open then state -> 'schedule' ->> 'profile' else coalesce(ret #>> '{}', state ->> 'defaultProfile') end;
  if mode = 'until-change' and profile = scheduled then
    ov := 'null'::jsonb;
  else
    ov := jsonb_build_object('profile', profile, 'mode', mode, 'windowOpenAtStart', open, 'setAt', floor(extract(epoch from at) * 1000)::bigint);
    if mode = 'until-time' and until_ms is not null then
      ov := ov || jsonb_build_object('until', until_ms);
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
  done integer := 0;
begin
  for f in
    select af.user_id, af.id, af.name, af.definition, af.timezone
      from public.automation_flows af
     where af.enabled
       and af.deleted_at is null
       and af.definition -> 'trigger' ->> 'type' = 'schedule.at_time'
       and jsonb_path_exists(af.definition, '$.actions[*] ? (@.type == "profile.activate")')
       and not jsonb_path_exists(af.definition, '$.conditions[*] ? (@.type != "local_time.in_range")')
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
                             where not nexus_private.in_range(c ->> 'start', c ->> 'end', p.minutes));

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
          state := nexus_private.choose_profile(state, act ->> 'profile', at, case when until_ms is null then 'until-change' else 'until-time' end, until_ms);
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

select cron.unschedule('nexus-flows') where exists (select 1 from cron.job where jobname = 'nexus-flows');
select cron.schedule('nexus-flows', '* * * * *', 'select nexus_private.run_flows()');

-- For Flow Studio and the Database-check: whether server runs are set up, and when the server
-- last ran one of your flows. Only your own runs.
create or replace function public.flows_server_status() returns jsonb
language sql stable security definer set search_path = public, pg_catalog as $$
  select jsonb_build_object(
    'scheduled', exists (select 1 from cron.job where jobname = 'nexus-flows'),
    'lastRun', (select floor(extract(epoch from max(started_at)) * 1000)::bigint from public.automation_runs
                 where user_id = auth.uid() and device_name = 'NEXUS-server')
  )
$$;
revoke all on function public.flows_server_status() from public;
grant execute on function public.flows_server_status() to authenticated;
