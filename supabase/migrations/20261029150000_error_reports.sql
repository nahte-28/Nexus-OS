-- NEXUS foutmeldingen: "Probleem melden" stores a report the owner reads in the Supabase
-- Table Editor. A user can add and see only their own reports; nobody can change them.
create table if not exists public.error_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  app text not null check (char_length(app) between 1 and 80),
  message text not null check (char_length(message) between 1 and 2000),
  stack text check (char_length(stack) <= 4000),
  note text check (char_length(note) <= 2000),
  version text not null check (char_length(version) <= 40),
  build text not null check (char_length(build) <= 40),
  platform text not null check (char_length(platform) <= 300),
  log jsonb not null default '[]'::jsonb check (jsonb_typeof(log) = 'array' and pg_column_size(log) <= 20000)
);
create index if not exists error_reports_user on public.error_reports (user_id, created_at desc);

alter table public.error_reports enable row level security;

drop policy if exists "Users send their own reports" on public.error_reports;
create policy "Users send their own reports" on public.error_reports
  for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists "Users read their own reports" on public.error_reports;
create policy "Users read their own reports" on public.error_reports
  for select to authenticated using (user_id = (select auth.uid()));

-- At most 20 reports per user per day, so a loop of errors cannot fill the database.
create or replace function public.limit_error_reports() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.error_reports
      where user_id = new.user_id and created_at > now() - interval '1 day') >= 20 then
    raise exception 'too many error reports';
  end if;
  return new;
end;
$$;
drop trigger if exists limit_error_reports on public.error_reports;
create trigger limit_error_reports before insert on public.error_reports
  for each row execute function public.limit_error_reports();

grant select, insert on public.error_reports to authenticated;
