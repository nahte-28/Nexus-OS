-- NEXUS Teamchat: every team (a study group with roles) gets a chat. Run after 20261030150000_teams.sql.
-- Everyone in the team (viewers too) reads and writes; you remove your own messages, the owner and
-- admins remove any. Who leaves the team takes their messages along. A team keeps its last 500
-- messages, and one member sends at most 30 per minute. Safe to run again.

create table if not exists public.team_messages (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null,
  user_id uuid not null default auth.uid(),
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now(),
  foreign key (group_id, user_id) references public.study_group_members (group_id, user_id) on delete cascade
);
create index if not exists team_messages_group_created on public.team_messages (group_id, created_at desc);

alter table public.team_messages enable row level security;

drop policy if exists "Members read the team chat" on public.team_messages;
create policy "Members read the team chat" on public.team_messages
  for select to authenticated using (public.is_study_group_member(group_id));
drop policy if exists "Members write in the team chat" on public.team_messages;
create policy "Members write in the team chat" on public.team_messages
  for insert to authenticated with check (user_id = (select auth.uid()) and public.is_study_group_member(group_id));
drop policy if exists "Senders and managers remove messages" on public.team_messages;
create policy "Senders and managers remove messages" on public.team_messages
  for delete to authenticated using (user_id = (select auth.uid()) or public.study_group_can_manage(group_id));

-- The server sets the time, so nobody backdates a message.
create or replace function public.team_messages_limit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.created_at := now();
  if (select count(*) from public.team_messages
      where group_id = new.group_id and user_id = new.user_id and created_at > now() - interval '1 minute') >= 30 then
    raise exception 'too many messages';
  end if;
  delete from public.team_messages where id in (
    select id from public.team_messages where group_id = new.group_id order by created_at desc offset 499
  );
  return new;
end $$;
drop trigger if exists team_messages_limit on public.team_messages;
create trigger team_messages_limit before insert on public.team_messages
  for each row execute function public.team_messages_limit();

-- Live in Teams › Chat (row level security applies).
do $$
begin
  alter publication supabase_realtime add table public.team_messages;
exception when duplicate_object then null;
end $$;
