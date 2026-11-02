-- NEXUS Teams voor de klas: a team can belong to a class (e.g. 1IT3) and be open to classmates.
-- Whoever fills in that class in NEXUS sees the open class teams by name and member count only,
-- and joins one as a member with one tap. Nothing else of the team is visible before joining.
-- The class is what each person types in: NEXUS does not check it, so the owner or an admin opens
-- a team on purpose. Invitations as a link (/join/<code>) need no SQL.
alter table public.study_groups add column if not exists klas text;
alter table public.study_groups add column if not exists class_open boolean not null default false;
do $$ begin
  alter table public.study_groups add constraint study_groups_klas check (klas is null or klas ~ '^[0-9A-Z]{2,8}$');
exception when duplicate_object then null; end $$;
create index if not exists study_groups_klas on public.study_groups (klas) where class_open;

-- A class as NEXUS stores it: capitals and digits only, e.g. " 1it3 " becomes 1IT3; null when empty or odd.
create or replace function public.normalize_klas(p text) returns text
language sql immutable as $$
  select case when upper(regexp_replace(coalesce(p, ''), '[^0-9A-Za-z]', '', 'g')) ~ '^[0-9A-Z]{2,8}$'
              then upper(regexp_replace(p, '[^0-9A-Za-z]', '', 'g')) end
$$;

-- Owner and admins set the class of a team and whether classmates may join it.
create or replace function public.set_team_class(p_group uuid, p_klas text, p_open boolean)
returns public.study_groups language plpgsql security definer set search_path = public as $$
declare
  k text := public.normalize_klas(p_klas);
  g public.study_groups;
begin
  if not public.study_group_can_manage(p_group) then raise exception 'not allowed'; end if;
  if nullif(trim(coalesce(p_klas, '')), '') is not null and k is null then raise exception 'invalid class'; end if;
  update public.study_groups set klas = k, class_open = coalesce(p_open, false) and k is not null
   where id = p_group returning * into g;
  return g;
end $$;

-- The open teams of a class that you are not in yet: only id, name and how many members.
create or replace function public.find_class_teams(p_klas text)
returns table (id uuid, name text, klas text, members int) language sql stable security definer set search_path = public as $$
  select g.id, g.name, g.klas, (select count(*)::int from public.study_group_members m where m.group_id = g.id)
    from public.study_groups g
   where auth.uid() is not null
     and g.class_open
     and g.klas = public.normalize_klas(p_klas)
     and not exists (select 1 from public.study_group_members m where m.group_id = g.id and m.user_id = auth.uid())
   order by g.created_at
   limit 20
$$;

-- Joins an open class team as a member, when your class matches; someone already in keeps their role.
create or replace function public.join_class_team(p_group uuid, p_klas text, p_display_name text)
returns public.study_groups language plpgsql security definer set search_path = public as $$
declare
  g public.study_groups;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select * into g from public.study_groups where id = p_group for update;
  if g.id is null or not g.class_open or g.klas is distinct from public.normalize_klas(p_klas) then
    raise exception 'class team closed';
  end if;
  if exists (select 1 from public.study_group_members where group_id = g.id and user_id = auth.uid()) then
    return g;
  end if;
  if (select count(*) from public.study_group_members where group_id = g.id) >= 30 then raise exception 'group full'; end if;
  insert into public.study_group_members (group_id, user_id, display_name, role)
  values (g.id, auth.uid(), left(trim(p_display_name), 40), 'member');
  return g;
end $$;

revoke all on function public.set_team_class(uuid, text, boolean) from public;
revoke all on function public.find_class_teams(text) from public;
revoke all on function public.join_class_team(uuid, text, text) from public;
grant execute on function public.set_team_class(uuid, text, boolean) to authenticated;
grant execute on function public.find_class_teams(text) to authenticated;
grant execute on function public.join_class_team(uuid, text, text) to authenticated;
