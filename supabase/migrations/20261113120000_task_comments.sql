-- NEXUS Opmerkingen: comments with @vermeldingen on the tasks of a team project and on group
-- deadlines. Run after 20261030150000_teams.sql. Everyone in the team (viewers too) reads and
-- comments; you remove your own comment, the owner and admins any. A mention only keeps members of
-- the team. At most 200 comments per task and 30 per minute per member. Safe to run again.

create table if not exists public.team_task_comments (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null,
  project_task_id uuid references public.team_project_tasks (id) on delete cascade,
  group_task_id uuid references public.study_group_tasks (id) on delete cascade,
  user_id uuid not null default auth.uid(),
  body text not null check (char_length(body) between 1 and 1000),
  mentions uuid[] not null default '{}' check (cardinality(mentions) <= 10),
  created_at timestamptz not null default now(),
  check (num_nonnulls(project_task_id, group_task_id) = 1),
  foreign key (group_id, user_id) references public.study_group_members (group_id, user_id) on delete cascade
);
create index if not exists team_task_comments_group on public.team_task_comments (group_id, created_at);
create index if not exists team_task_comments_project_task on public.team_task_comments (project_task_id);
create index if not exists team_task_comments_group_task on public.team_task_comments (group_task_id);

alter table public.team_task_comments enable row level security;

drop policy if exists "Members read task comments" on public.team_task_comments;
create policy "Members read task comments" on public.team_task_comments
  for select to authenticated using (public.is_study_group_member(group_id));
drop policy if exists "Members comment on tasks of their team" on public.team_task_comments;
create policy "Members comment on tasks of their team" on public.team_task_comments
  for insert to authenticated with check (
    user_id = (select auth.uid()) and public.is_study_group_member(group_id)
    and (
      exists (select 1 from public.team_project_tasks t where t.id = project_task_id and t.group_id = team_task_comments.group_id)
      or exists (select 1 from public.study_group_tasks t where t.id = group_task_id and t.group_id = team_task_comments.group_id)
    )
  );
drop policy if exists "Writers and managers remove comments" on public.team_task_comments;
create policy "Writers and managers remove comments" on public.team_task_comments
  for delete to authenticated using (user_id = (select auth.uid()) or public.study_group_can_manage(group_id));

-- The server sets the time, keeps only mentions of members and holds the limits.
create or replace function public.team_task_comments_limit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.created_at := now();
  new.mentions := coalesce(array(
    select distinct m from unnest(new.mentions) m
    where m <> new.user_id and exists (select 1 from public.study_group_members s where s.group_id = new.group_id and s.user_id = m)
  ), '{}');
  if (select count(*) from public.team_task_comments
      where group_id = new.group_id and user_id = new.user_id and created_at > now() - interval '1 minute') >= 30 then
    raise exception 'too many comments';
  end if;
  if (select count(*) from public.team_task_comments
      where project_task_id is not distinct from new.project_task_id and group_task_id is not distinct from new.group_task_id) >= 200 then
    raise exception 'too many task comments';
  end if;
  return new;
end $$;
drop trigger if exists team_task_comments_limit on public.team_task_comments;
create trigger team_task_comments_limit before insert on public.team_task_comments
  for each row execute function public.team_task_comments_limit();

-- Live in Teams › Projecten and Studie › Groep (row level security applies).
do $$
begin
  alter publication supabase_realtime add table public.team_task_comments;
exception when duplicate_object then null;
end $$;
