-- NEXUS Teams: a study group gets roles (owner, admin, member, viewer), invitations that expire and
-- shared project tasks. A team IS a study group, so everything from before keeps working. Who may do
-- what is decided here, never by the app alone:
--   owner   everything, hands the team over, deletes it
--   admin   invites, changes the roles of members and viewers, removes them, renames the team
--   member  shares items, adds group deadlines, projects and project tasks
--   viewer  reads along, nothing more
alter table public.study_group_members add column if not exists role text not null default 'member';
do $$ begin
  alter table public.study_group_members add constraint study_group_members_role check (role in ('owner', 'admin', 'member', 'viewer'));
exception when duplicate_object then null; end $$;
update public.study_group_members m set role = 'owner'
  from public.study_groups g where g.id = m.group_id and g.created_by = m.user_id and m.role <> 'owner';

-- Members change only their own name, never their own role: roles go through the functions below.
revoke update on public.study_group_members from anon, authenticated;
grant update (display_name) on public.study_group_members to authenticated;

-- Your role in a team, or null when you are not in it (no recursion through the policies).
create or replace function public.study_group_role(g uuid)
returns text language sql stable security definer set search_path = public as $$
  select role from public.study_group_members where group_id = g and user_id = auth.uid()
$$;
revoke all on function public.study_group_role(uuid) from public;
grant execute on function public.study_group_role(uuid) to authenticated;

create or replace function public.study_group_can_edit(g uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.study_group_role(g) in ('owner', 'admin', 'member'), false)
$$;
create or replace function public.study_group_can_manage(g uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.study_group_role(g) in ('owner', 'admin'), false)
$$;
revoke all on function public.study_group_can_edit(uuid) from public;
revoke all on function public.study_group_can_manage(uuid) from public;
grant execute on function public.study_group_can_edit(uuid) to authenticated;
grant execute on function public.study_group_can_manage(uuid) to authenticated;

-- The team itself: owner and admins rename it, only the owner deletes it.
drop policy if exists "Creators rename their study groups" on public.study_groups;
drop policy if exists "Managers rename their teams" on public.study_groups;
create policy "Managers rename their teams" on public.study_groups
  for update to authenticated using (public.study_group_can_manage(id)) with check (public.study_group_can_manage(id));
revoke update on public.study_groups from anon, authenticated;
grant update (name) on public.study_groups to authenticated;
drop policy if exists "Creators delete their study groups" on public.study_groups;
drop policy if exists "Owners delete their teams" on public.study_groups;
create policy "Owners delete their teams" on public.study_groups
  for delete to authenticated using (public.study_group_role(id) = 'owner');

-- The owner can't just walk away: hand the team over or delete it.
drop policy if exists "Members leave a group" on public.study_group_members;
create policy "Members leave a group" on public.study_group_members
  for delete to authenticated using (user_id = (select auth.uid()) and role <> 'owner');

-- Viewers read along: no sharing, no group deadlines, no ticking off.
drop policy if exists "Members share their own items" on public.study_group_items;
create policy "Members share their own items" on public.study_group_items
  for insert to authenticated with check (user_id = (select auth.uid()) and public.study_group_can_edit(group_id));
drop policy if exists "Members update their own items" on public.study_group_items;
create policy "Members update their own items" on public.study_group_items
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()) and public.study_group_can_edit(group_id));
drop policy if exists "Members add group deadlines" on public.study_group_tasks;
create policy "Members add group deadlines" on public.study_group_tasks
  for insert to authenticated with check (created_by = (select auth.uid()) and public.study_group_can_edit(group_id));
drop policy if exists "Makers delete group deadlines" on public.study_group_tasks;
create policy "Makers delete group deadlines" on public.study_group_tasks
  for delete to authenticated using (created_by = (select auth.uid()) or public.study_group_can_manage(group_id));
drop policy if exists "Members tick off for themselves" on public.study_group_task_done;
create policy "Members tick off for themselves" on public.study_group_task_done
  for insert to authenticated with check (
    user_id = (select auth.uid()) and public.study_group_can_edit(group_id)
    and exists (select 1 from public.study_group_tasks t where t.id = task_id and t.group_id = study_group_task_done.group_id)
  );

-- A new team now starts with you as its owner.
create or replace function public.create_study_group(p_name text, p_display_name text)
returns public.study_groups language plpgsql security definer set search_path = public as $$
declare
  g public.study_groups;
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code text;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if (select count(*) from public.study_groups where created_by = auth.uid()) >= 10 then
    raise exception 'too many groups';
  end if;
  loop
    code := '';
    for i in 1..8 loop
      code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    begin
      insert into public.study_groups (name, invite_code, created_by)
      values (left(trim(p_name), 60), code, auth.uid()) returning * into g;
      exit;
    exception when unique_violation then
      -- Try another code.
    end;
  end loop;
  insert into public.study_group_members (group_id, user_id, display_name, role)
  values (g.id, auth.uid(), left(trim(p_display_name), 40), 'owner');
  return g;
end $$;

-- Invitations: a code of 10 letters and digits with a role, an end and optionally a number of uses.
create table if not exists public.team_invites (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.study_groups (id) on delete cascade,
  code text not null unique check (code ~ '^[A-HJ-NP-Z2-9]{10}$'),
  role text not null check (role in ('admin', 'member', 'viewer')),
  expires_at timestamptz not null,
  max_uses int check (max_uses between 1 and 30),
  uses int not null default 0,
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists team_invites_group on public.team_invites (group_id);
alter table public.team_invites enable row level security;

-- Only owner and admins see and withdraw invitations; making one goes through create_team_invite.
drop policy if exists "Managers see invitations" on public.team_invites;
create policy "Managers see invitations" on public.team_invites
  for select to authenticated using (public.study_group_can_manage(group_id));
drop policy if exists "Managers withdraw invitations" on public.team_invites;
create policy "Managers withdraw invitations" on public.team_invites
  for delete to authenticated using (public.study_group_can_manage(group_id));

-- Admins invite members and viewers; only the owner invites admins. Valid 1 hour to 30 days.
create or replace function public.create_team_invite(p_group uuid, p_role text, p_hours int, p_max_uses int)
returns public.team_invites language plpgsql security definer set search_path = public as $$
declare
  inv public.team_invites;
  mine text := public.study_group_role(p_group);
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code text;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if mine is null or mine not in ('owner', 'admin') then raise exception 'not allowed'; end if;
  if p_role not in ('admin', 'member', 'viewer') or (p_role = 'admin' and mine <> 'owner') then raise exception 'not allowed'; end if;
  if p_hours is null or p_hours not between 1 and 720 then raise exception 'invalid invite'; end if;
  if p_max_uses is not null and p_max_uses not between 1 and 30 then raise exception 'invalid invite'; end if;
  delete from public.team_invites where group_id = p_group and expires_at < now();
  if (select count(*) from public.team_invites where group_id = p_group) >= 20 then raise exception 'too many invites'; end if;
  loop
    code := '';
    for i in 1..10 loop
      code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    begin
      insert into public.team_invites (group_id, code, role, expires_at, max_uses, created_by)
      values (p_group, code, p_role, now() + make_interval(hours => p_hours), p_max_uses, auth.uid()) returning * into inv;
      exit;
    exception when unique_violation then
      -- Try another code.
    end;
  end loop;
  return inv;
end $$;

-- Joins with an invitation; null when the code is unknown. Someone already in the team keeps their role.
create or replace function public.join_team(p_code text, p_display_name text)
returns public.study_groups language plpgsql security definer set search_path = public as $$
declare
  inv public.team_invites;
  g public.study_groups;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select * into inv from public.team_invites where code = upper(p_code) for update;
  if inv.id is null then return null; end if;
  select * into g from public.study_groups where id = inv.group_id;
  if exists (select 1 from public.study_group_members where group_id = g.id and user_id = auth.uid()) then
    update public.study_group_members set display_name = left(trim(p_display_name), 40) where group_id = g.id and user_id = auth.uid();
    return g;
  end if;
  if inv.expires_at < now() then raise exception 'invite expired'; end if;
  if inv.max_uses is not null and inv.uses >= inv.max_uses then raise exception 'invite used up'; end if;
  if (select count(*) from public.study_group_members where group_id = g.id) >= 30 then raise exception 'group full'; end if;
  insert into public.study_group_members (group_id, user_id, display_name, role)
  values (g.id, auth.uid(), left(trim(p_display_name), 40), inv.role);
  update public.team_invites set uses = uses + 1 where id = inv.id;
  return g;
end $$;

-- Changes someone's role. The owner sets admin, member or viewer; an admin only moves members and viewers.
create or replace function public.set_team_role(p_group uuid, p_user uuid, p_role text)
returns void language plpgsql security definer set search_path = public as $$
declare
  mine text := public.study_group_role(p_group);
  theirs text;
begin
  select role into theirs from public.study_group_members where group_id = p_group and user_id = p_user;
  if theirs is null or p_user = auth.uid() or theirs = 'owner' or p_role not in ('admin', 'member', 'viewer') then raise exception 'not allowed'; end if;
  if mine = 'owner' or (mine = 'admin' and theirs in ('member', 'viewer') and p_role in ('member', 'viewer')) then
    update public.study_group_members set role = p_role where group_id = p_group and user_id = p_user;
  else
    raise exception 'not allowed';
  end if;
end $$;

-- Takes someone out of the team, with everything they shared there. Same rules as set_team_role.
create or replace function public.remove_team_member(p_group uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  mine text := public.study_group_role(p_group);
  theirs text;
begin
  select role into theirs from public.study_group_members where group_id = p_group and user_id = p_user;
  if theirs is null or p_user = auth.uid() or theirs = 'owner' then raise exception 'not allowed'; end if;
  if mine = 'owner' or (mine = 'admin' and theirs in ('member', 'viewer')) then
    delete from public.study_group_members where group_id = p_group and user_id = p_user;
  else
    raise exception 'not allowed';
  end if;
end $$;

-- The owner hands the team to another member and becomes an admin.
create or replace function public.transfer_team(p_group uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.study_group_role(p_group) is distinct from 'owner' or p_user = auth.uid()
     or not exists (select 1 from public.study_group_members where group_id = p_group and user_id = p_user) then
    raise exception 'not allowed';
  end if;
  update public.study_group_members set role = 'admin' where group_id = p_group and user_id = auth.uid();
  update public.study_group_members set role = 'owner' where group_id = p_group and user_id = p_user;
  update public.study_groups set created_by = p_user where id = p_group;
end $$;

revoke all on function public.create_team_invite(uuid, text, int, int) from public;
revoke all on function public.join_team(text, text) from public;
revoke all on function public.set_team_role(uuid, uuid, text) from public;
revoke all on function public.remove_team_member(uuid, uuid) from public;
revoke all on function public.transfer_team(uuid, uuid) from public;
grant execute on function public.create_team_invite(uuid, text, int, int) to authenticated;
grant execute on function public.join_team(text, text) to authenticated;
grant execute on function public.set_team_role(uuid, uuid, text) to authenticated;
grant execute on function public.remove_team_member(uuid, uuid) to authenticated;
grant execute on function public.transfer_team(uuid, uuid) to authenticated;

-- Shared projects: one board per project that the whole team works on together.
create table if not exists public.team_projects (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.study_groups (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists team_projects_group on public.team_projects (group_id);

create table if not exists public.team_project_tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.team_projects (id) on delete cascade,
  group_id uuid not null,
  title text not null check (char_length(title) between 1 and 160),
  status text not null default 'todo' check (status in ('todo', 'doing', 'done')),
  assignee uuid,
  due_at bigint,
  created_by uuid not null default auth.uid(),
  updated_by uuid not null default auth.uid(),
  updated_at timestamptz not null default now(),
  -- Someone who leaves the team is no longer anyone's assignee.
  foreign key (group_id, assignee) references public.study_group_members (group_id, user_id) on delete set null (assignee)
);
create index if not exists team_project_tasks_group on public.team_project_tasks (group_id);
create index if not exists team_project_tasks_project on public.team_project_tasks (project_id);

alter table public.team_projects enable row level security;
alter table public.team_project_tasks enable row level security;

drop policy if exists "Members read team projects" on public.team_projects;
create policy "Members read team projects" on public.team_projects
  for select to authenticated using (public.is_study_group_member(group_id));
drop policy if exists "Members start team projects" on public.team_projects;
create policy "Members start team projects" on public.team_projects
  for insert to authenticated with check (created_by = (select auth.uid()) and public.study_group_can_edit(group_id));
drop policy if exists "Makers and managers rename team projects" on public.team_projects;
create policy "Makers and managers rename team projects" on public.team_projects
  for update to authenticated
  using ((created_by = (select auth.uid()) and public.study_group_can_edit(group_id)) or public.study_group_can_manage(group_id))
  with check (public.study_group_can_edit(group_id));
revoke update on public.team_projects from anon, authenticated;
grant update (name) on public.team_projects to authenticated;
drop policy if exists "Makers and managers delete team projects" on public.team_projects;
create policy "Makers and managers delete team projects" on public.team_projects
  for delete to authenticated using ((created_by = (select auth.uid()) and public.study_group_can_edit(group_id)) or public.study_group_can_manage(group_id));

-- Everyone who may edit works on every task of a shared project; viewers only read.
drop policy if exists "Members read project tasks" on public.team_project_tasks;
create policy "Members read project tasks" on public.team_project_tasks
  for select to authenticated using (public.is_study_group_member(group_id));
drop policy if exists "Editors add project tasks" on public.team_project_tasks;
create policy "Editors add project tasks" on public.team_project_tasks
  for insert to authenticated with check (
    created_by = (select auth.uid()) and public.study_group_can_edit(group_id)
    and exists (select 1 from public.team_projects p where p.id = project_id and p.group_id = team_project_tasks.group_id)
  );
drop policy if exists "Editors change project tasks" on public.team_project_tasks;
create policy "Editors change project tasks" on public.team_project_tasks
  for update to authenticated using (public.study_group_can_edit(group_id)) with check (public.study_group_can_edit(group_id));
revoke update on public.team_project_tasks from anon, authenticated;
grant update (title, status, assignee, due_at) on public.team_project_tasks to authenticated;
drop policy if exists "Editors delete project tasks" on public.team_project_tasks;
create policy "Editors delete project tasks" on public.team_project_tasks
  for delete to authenticated using (public.study_group_can_edit(group_id));

-- Who changed a task last, and when; and limits so no one floods the team.
create or replace function public.team_project_tasks_touch()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if (select count(*) from public.team_project_tasks where project_id = new.project_id) >= 300 then
      raise exception 'too many project tasks';
    end if;
  end if;
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists team_project_tasks_touch on public.team_project_tasks;
create trigger team_project_tasks_touch before insert or update on public.team_project_tasks
  for each row execute function public.team_project_tasks_touch();

create or replace function public.team_projects_limit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.team_projects where group_id = new.group_id) >= 30 then
    raise exception 'too many team projects';
  end if;
  return new;
end $$;
drop trigger if exists team_projects_limit on public.team_projects;
create trigger team_projects_limit before insert on public.team_projects
  for each row execute function public.team_projects_limit();

-- Live updates for the shared boards (row level security applies).
do $$
declare t text;
begin
  foreach t in array array['team_projects', 'team_project_tasks'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;
