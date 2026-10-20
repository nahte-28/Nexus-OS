-- NEXUS OS v0.8: settings that follow you to every device (first: NEXUS Profiles).
-- One row per user and key. Each change carries a revision; an older or equal revision never
-- overwrites a newer one, so two devices cannot keep undoing each other.

create table if not exists public.user_settings (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  key text not null check (key in ('profiles')),
  value jsonb not null check (pg_column_size(value) < 200000),
  revision bigint not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

alter table public.user_settings enable row level security;

create policy "Users read their own settings" on public.user_settings
  for select to authenticated using ((select auth.uid()) = user_id);

create policy "Users create their own settings" on public.user_settings
  for insert to authenticated with check ((select auth.uid()) = user_id);

create policy "Users update their own settings" on public.user_settings
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create or replace function public.user_settings_before_write() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' then
    -- A copy that is not newer than the stored one is skipped; the device then pulls the stored one.
    if new.revision <= old.revision then
      return null;
    end if;
    new.user_id := old.user_id;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists user_settings_before_write on public.user_settings;
create trigger user_settings_before_write
  before insert or update on public.user_settings
  for each row execute function public.user_settings_before_write();

-- Lets open devices hear about a change instantly.
alter publication supabase_realtime add table public.user_settings;
