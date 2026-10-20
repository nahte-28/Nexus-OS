-- NEXUS OS Flow Studio: flows and their runs follow you to every device.
-- Every row belongs to the signed-in user (RLS); the server never trusts a user_id from the app.

-- Flow definitions. A deletion stays as a row without definition, so other devices remove it too.
-- Each change carries a revision (the time of the change); an older one never overwrites a newer one.
create table if not exists public.automation_flows (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null check (char_length(id) between 1 and 64),
  name text not null default '' check (char_length(name) <= 200),
  enabled boolean not null default false,
  definition jsonb check (
    definition is null
    or (
      jsonb_typeof(definition) = 'object'
      and pg_column_size(definition) < 50000
      and case when jsonb_typeof(definition -> 'actions') = 'array' then jsonb_array_length(definition -> 'actions') between 1 and 5 else false end
      and case when jsonb_typeof(definition -> 'conditions') = 'array' then jsonb_array_length(definition -> 'conditions') <= 5 else false end
    )
  ),
  version integer not null default 1,
  timezone text not null default '' check (char_length(timezone) <= 64),
  revision bigint not null,
  deleted_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, id),
  check ((definition is null) = (deleted_at is not null))
);

alter table public.automation_flows enable row level security;

create policy "Users read their own flows" on public.automation_flows
  for select to authenticated using ((select auth.uid()) = user_id);

create policy "Users create their own flows" on public.automation_flows
  for insert to authenticated with check ((select auth.uid()) = user_id);

create policy "Users update their own flows" on public.automation_flows
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create or replace function public.automation_flows_before_write() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' then
    -- A copy that is not newer than the stored one is skipped; the device then takes the stored one.
    if new.revision <= old.revision then
      return null;
    end if;
    new.user_id := old.user_id;
  elsif (select count(*) from public.automation_flows where user_id = new.user_id) >= 200 then
    raise exception 'Je hebt al 200 flows.' using errcode = 'check_violation';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists automation_flows_before_write on public.automation_flows;
create trigger automation_flows_before_write
  before insert or update on public.automation_flows
  for each row execute function public.automation_flows_before_write();

-- Runs. (user_id, flow_id, event_id) is the idempotency key: the device that writes the row first
-- runs the actions, the others skip that event. Steps say what each action did, never the content
-- of a message.
create table if not exists public.automation_runs (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  flow_id text not null check (char_length(flow_id) <= 64),
  flow_name text not null default '' check (char_length(flow_name) <= 200),
  event_id text not null check (char_length(event_id) <= 300),
  trigger_type text not null check (char_length(trigger_type) <= 40),
  status text not null check (status in ('running', 'ok', 'failed')),
  manual boolean not null default false,
  device_name text check (char_length(device_name) <= 100),
  steps jsonb not null default '[]' check (jsonb_typeof(steps) = 'array' and pg_column_size(steps) < 20000),
  started_at timestamptz not null,
  completed_at timestamptz,
  unique (user_id, flow_id, event_id)
);

create index if not exists automation_runs_user_started on public.automation_runs (user_id, started_at desc);

alter table public.automation_runs enable row level security;

create policy "Users read their own runs" on public.automation_runs
  for select to authenticated using ((select auth.uid()) = user_id);

create policy "Users create their own runs" on public.automation_runs
  for insert to authenticated with check ((select auth.uid()) = user_id);

create policy "Users update their own runs" on public.automation_runs
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "Users delete their own runs" on public.automation_runs
  for delete to authenticated using ((select auth.uid()) = user_id);

create or replace function public.automation_runs_before_update() returns trigger
language plpgsql as $$
begin
  -- Only the outcome of a run can change, not whose run it is or which event it was for.
  new.user_id := old.user_id;
  new.flow_id := old.flow_id;
  new.event_id := old.event_id;
  new.started_at := old.started_at;
  return new;
end;
$$;

drop trigger if exists automation_runs_before_update on public.automation_runs;
create trigger automation_runs_before_update
  before update on public.automation_runs
  for each row execute function public.automation_runs_before_update();

-- Pause-all and quiet hours go in the existing user_settings table, under the key 'flows'.
alter table public.user_settings drop constraint if exists user_settings_key_check;
alter table public.user_settings add constraint user_settings_key_check check (key in ('profiles', 'flows'));

-- Lets open devices hear about a change instantly.
alter publication supabase_realtime add table public.automation_flows;
alter publication supabase_realtime add table public.automation_runs;
