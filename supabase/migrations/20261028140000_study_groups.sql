-- NEXUS Studiegroep: friends in a group see the deadlines, exams and study time each member chose
-- to share. Only members read a group; each member writes only their own shared items, and
-- joining goes through the invite code (the two functions below), never by inserting rows.
create table if not exists public.study_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 60),
  invite_code text not null unique check (invite_code ~ '^[A-HJ-NP-Z2-9]{8}$'),
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.study_group_members (
  group_id uuid not null references public.study_groups (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 40),
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create table if not exists public.study_group_items (
  group_id uuid not null,
  user_id uuid not null default auth.uid(),
  source_id text not null check (char_length(source_id) between 1 and 80),
  kind text not null check (kind in ('deadline', 'exam', 'study')),
  title text not null check (char_length(title) between 1 and 160),
  at bigint not null,
  end_at bigint,
  done boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (group_id, user_id, source_id),
  -- Leaving a group takes everything you shared there with you.
  foreign key (group_id, user_id) references public.study_group_members (group_id, user_id) on delete cascade
);

alter table public.study_groups enable row level security;
alter table public.study_group_members enable row level security;
alter table public.study_group_items enable row level security;

-- Looks up membership without going through the policies of the members table (no recursion).
create or replace function public.is_study_group_member(g uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.study_group_members where group_id = g and user_id = auth.uid())
$$;
revoke all on function public.is_study_group_member(uuid) from public;
grant execute on function public.is_study_group_member(uuid) to authenticated;

drop policy if exists "Members read their study groups" on public.study_groups;
create policy "Members read their study groups" on public.study_groups
  for select to authenticated using (public.is_study_group_member(id));
drop policy if exists "Creators rename their study groups" on public.study_groups;
create policy "Creators rename their study groups" on public.study_groups
  for update to authenticated using (created_by = (select auth.uid())) with check (created_by = (select auth.uid()));
drop policy if exists "Creators delete their study groups" on public.study_groups;
create policy "Creators delete their study groups" on public.study_groups
  for delete to authenticated using (created_by = (select auth.uid()));

drop policy if exists "Members see each other" on public.study_group_members;
create policy "Members see each other" on public.study_group_members
  for select to authenticated using (public.is_study_group_member(group_id));
drop policy if exists "Members change their own name" on public.study_group_members;
create policy "Members change their own name" on public.study_group_members
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists "Members leave a group" on public.study_group_members;
create policy "Members leave a group" on public.study_group_members
  for delete to authenticated using (user_id = (select auth.uid()));

drop policy if exists "Members read shared items" on public.study_group_items;
create policy "Members read shared items" on public.study_group_items
  for select to authenticated using (public.is_study_group_member(group_id));
drop policy if exists "Members share their own items" on public.study_group_items;
create policy "Members share their own items" on public.study_group_items
  for insert to authenticated with check (user_id = (select auth.uid()) and public.is_study_group_member(group_id));
drop policy if exists "Members update their own items" on public.study_group_items;
create policy "Members update their own items" on public.study_group_items
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()) and public.is_study_group_member(group_id));
drop policy if exists "Members stop sharing their own items" on public.study_group_items;
create policy "Members stop sharing their own items" on public.study_group_items
  for delete to authenticated using (user_id = (select auth.uid()));

-- A new group with you as its first member; returns the group with its invite code.
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
  insert into public.study_group_members (group_id, user_id, display_name)
  values (g.id, auth.uid(), left(trim(p_display_name), 40));
  return g;
end $$;

-- Joins the group with this invite code (at most 30 members); null when the code is unknown.
create or replace function public.join_study_group(p_code text, p_display_name text)
returns public.study_groups language plpgsql security definer set search_path = public as $$
declare
  g public.study_groups;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select * into g from public.study_groups where invite_code = upper(p_code);
  if g.id is null then return null; end if;
  if not exists (select 1 from public.study_group_members where group_id = g.id and user_id = auth.uid())
     and (select count(*) from public.study_group_members where group_id = g.id) >= 30 then
    raise exception 'group full';
  end if;
  insert into public.study_group_members (group_id, user_id, display_name)
  values (g.id, auth.uid(), left(trim(p_display_name), 40))
  on conflict (group_id, user_id) do update set display_name = excluded.display_name;
  return g;
end $$;

revoke all on function public.create_study_group(text, text) from public;
revoke all on function public.join_study_group(text, text) from public;
grant execute on function public.create_study_group(text, text) to authenticated;
grant execute on function public.join_study_group(text, text) to authenticated;
