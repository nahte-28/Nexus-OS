-- Stand-ins for what a Supabase database already has, so the migrations run on plain Postgres
-- in CI. Only the shapes the migrations use; nothing here is part of NEXUS itself.
do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
do $$ begin create role service_role nologin bypassrls; exception when duplicate_object then null; end $$;
grant usage on schema public to anon, authenticated, service_role;

create schema if not exists auth;
create table if not exists auth.users (id uuid primary key, email text);
-- The tests pick the signed-in user with: set test.uid = '<uuid>'.
create or replace function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;

create schema if not exists storage;
create table if not exists storage.buckets (id text primary key, name text not null, public boolean default false,
  file_size_limit bigint, allowed_mime_types text[]);
create table if not exists storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets (id),
  name text not null, owner uuid, created_at timestamptz default now());
alter table storage.objects enable row level security;
create or replace function storage.foldername(name text) returns text[] language sql immutable as
  $$ select string_to_array(name, '/') $$;
grant usage on schema storage to authenticated;
grant select, insert, update, delete on storage.objects to authenticated;

-- pg_cron and pg_net (web push dispatch) only exist on Supabase.
create schema if not exists cron;
create table if not exists cron.job (jobid serial primary key, jobname text, schedule text, command text);
create or replace function cron.schedule(name text, schedule text, command text) returns bigint language sql as
  $$ insert into cron.job (jobname, schedule, command) values (name, schedule, command) returning jobid $$;
create or replace function cron.unschedule(name text) returns boolean language sql as
  $$ delete from cron.job where jobname = name returning true $$;
create schema if not exists net;
create or replace function net.http_post(url text, body jsonb default '{}', params jsonb default '{}', headers jsonb default '{}',
  timeout_milliseconds int default 1000) returns bigint language sql as $$ select 1::bigint $$;

do $$ begin create publication supabase_realtime; exception when duplicate_object then null; end $$;

-- Supabase grants anon and authenticated access to everything new in public; row-level security
-- is what keeps users apart. Do the same here, so the tests prove RLS and not missing grants.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
