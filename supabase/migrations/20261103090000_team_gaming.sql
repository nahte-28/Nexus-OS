-- NEXUS Gamevrienden: in a team you see who is gaming right now and plan sessions to play together.
-- Run after 20261030150000_teams.sql. Everyone in a team (viewers too) shares only what they choose:
--   team_playing     one row per member who shares that they are gaming: the game and since when
--   team_game_plans  a session to play together, at a moment, with an optional note
--   team_game_rsvp   per member: doe mee, misschien or niet
-- Nothing here comes from a game platform: it is what members enter or what their Gaming timer says.

create table if not exists public.team_playing (
  group_id uuid not null,
  user_id uuid not null default auth.uid(),
  game text not null check (char_length(game) between 1 and 80),
  started_at bigint not null,
  updated_at timestamptz not null default now(),
  primary key (group_id, user_id),
  -- Who leaves the team stops showing up in it.
  foreign key (group_id, user_id) references public.study_group_members (group_id, user_id) on delete cascade
);

create table if not exists public.team_game_plans (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.study_groups (id) on delete cascade,
  game text not null check (char_length(game) between 1 and 80),
  starts_at bigint not null,
  note text not null default '' check (char_length(note) <= 200),
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists team_game_plans_group on public.team_game_plans (group_id);

create table if not exists public.team_game_rsvp (
  plan_id uuid not null references public.team_game_plans (id) on delete cascade,
  group_id uuid not null,
  user_id uuid not null default auth.uid(),
  answer text not null check (answer in ('yes', 'maybe', 'no')),
  updated_at timestamptz not null default now(),
  primary key (plan_id, user_id),
  foreign key (group_id, user_id) references public.study_group_members (group_id, user_id) on delete cascade
);
create index if not exists team_game_rsvp_group on public.team_game_rsvp (group_id);

alter table public.team_playing enable row level security;
alter table public.team_game_plans enable row level security;
alter table public.team_game_rsvp enable row level security;

-- Playing now: the team reads it, each member writes only their own row.
drop policy if exists "Members see who is playing" on public.team_playing;
create policy "Members see who is playing" on public.team_playing
  for select to authenticated using (public.is_study_group_member(group_id));
drop policy if exists "Members share their own playing" on public.team_playing;
create policy "Members share their own playing" on public.team_playing
  for insert to authenticated with check (user_id = (select auth.uid()) and public.is_study_group_member(group_id));
drop policy if exists "Members update their own playing" on public.team_playing;
create policy "Members update their own playing" on public.team_playing
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()) and public.is_study_group_member(group_id));
drop policy if exists "Members stop sharing their playing" on public.team_playing;
create policy "Members stop sharing their playing" on public.team_playing
  for delete to authenticated using (user_id = (select auth.uid()));

-- Plans: members (not viewers) plan, the maker or a manager removes.
drop policy if exists "Members read game plans" on public.team_game_plans;
create policy "Members read game plans" on public.team_game_plans
  for select to authenticated using (public.is_study_group_member(group_id));
drop policy if exists "Editors plan games" on public.team_game_plans;
create policy "Editors plan games" on public.team_game_plans
  for insert to authenticated with check (created_by = (select auth.uid()) and public.study_group_can_edit(group_id));
drop policy if exists "Makers and managers remove game plans" on public.team_game_plans;
create policy "Makers and managers remove game plans" on public.team_game_plans
  for delete to authenticated using (created_by = (select auth.uid()) or public.study_group_can_manage(group_id));

-- Answers: everyone in the team answers for themselves, on a plan of that team.
drop policy if exists "Members read answers" on public.team_game_rsvp;
create policy "Members read answers" on public.team_game_rsvp
  for select to authenticated using (public.is_study_group_member(group_id));
drop policy if exists "Members answer for themselves" on public.team_game_rsvp;
create policy "Members answer for themselves" on public.team_game_rsvp
  for insert to authenticated with check (
    user_id = (select auth.uid()) and public.is_study_group_member(group_id)
    and exists (select 1 from public.team_game_plans p where p.id = plan_id and p.group_id = team_game_rsvp.group_id)
  );
drop policy if exists "Members change their own answer" on public.team_game_rsvp;
create policy "Members change their own answer" on public.team_game_rsvp
  for update to authenticated using (user_id = (select auth.uid())) with check (
    user_id = (select auth.uid()) and public.is_study_group_member(group_id)
    and exists (select 1 from public.team_game_plans p where p.id = plan_id and p.group_id = team_game_rsvp.group_id)
  );
drop policy if exists "Members take back their answer" on public.team_game_rsvp;
create policy "Members take back their answer" on public.team_game_rsvp
  for delete to authenticated using (user_id = (select auth.uid()));

-- Old plans clean themselves up (a week after they started), and a team keeps at most 50.
create or replace function public.team_game_plans_limit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from public.team_game_plans
    where group_id = new.group_id and starts_at < (extract(epoch from now()) * 1000)::bigint - 7 * 86400000;
  if (select count(*) from public.team_game_plans where group_id = new.group_id) >= 50 then
    raise exception 'too many game plans';
  end if;
  return new;
end $$;
drop trigger if exists team_game_plans_limit on public.team_game_plans;
create trigger team_game_plans_limit before insert on public.team_game_plans
  for each row execute function public.team_game_plans_limit();

-- Live updates in Gaming › Vrienden (row level security applies).
do $$
declare t text;
begin
  foreach t in array array['team_playing', 'team_game_plans', 'team_game_rsvp'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;
