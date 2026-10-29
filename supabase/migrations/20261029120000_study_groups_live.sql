-- NEXUS Studiegroep, deel 2: the group updates live (realtime) and has deadlines of its own that
-- every member ticks off for themselves. Same rules as before: only members read a group.
create table if not exists public.study_group_tasks (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.study_groups (id) on delete cascade,
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 160),
  due_at bigint not null,
  created_at timestamptz not null default now()
);
create index if not exists study_group_tasks_group on public.study_group_tasks (group_id);

create table if not exists public.study_group_task_done (
  task_id uuid not null references public.study_group_tasks (id) on delete cascade,
  group_id uuid not null,
  user_id uuid not null default auth.uid(),
  done_at timestamptz not null default now(),
  primary key (task_id, user_id),
  -- Leaving the group takes your ticks with you.
  foreign key (group_id, user_id) references public.study_group_members (group_id, user_id) on delete cascade
);

alter table public.study_group_tasks enable row level security;
alter table public.study_group_task_done enable row level security;

drop policy if exists "Members read group deadlines" on public.study_group_tasks;
create policy "Members read group deadlines" on public.study_group_tasks
  for select to authenticated using (public.is_study_group_member(group_id));
drop policy if exists "Members add group deadlines" on public.study_group_tasks;
create policy "Members add group deadlines" on public.study_group_tasks
  for insert to authenticated with check (created_by = (select auth.uid()) and public.is_study_group_member(group_id));
drop policy if exists "Makers change group deadlines" on public.study_group_tasks;
create policy "Makers change group deadlines" on public.study_group_tasks
  for update to authenticated using (created_by = (select auth.uid())) with check (created_by = (select auth.uid()) and public.is_study_group_member(group_id));
drop policy if exists "Makers delete group deadlines" on public.study_group_tasks;
create policy "Makers delete group deadlines" on public.study_group_tasks
  for delete to authenticated using (created_by = (select auth.uid()));

drop policy if exists "Members see who is done" on public.study_group_task_done;
create policy "Members see who is done" on public.study_group_task_done
  for select to authenticated using (public.is_study_group_member(group_id));
drop policy if exists "Members tick off for themselves" on public.study_group_task_done;
create policy "Members tick off for themselves" on public.study_group_task_done
  for insert to authenticated with check (
    user_id = (select auth.uid()) and public.is_study_group_member(group_id)
    and exists (select 1 from public.study_group_tasks t where t.id = task_id and t.group_id = study_group_task_done.group_id)
  );
drop policy if exists "Members untick for themselves" on public.study_group_task_done;
create policy "Members untick for themselves" on public.study_group_task_done
  for delete to authenticated using (user_id = (select auth.uid()));

-- At most 100 open group deadlines per group, so one member can't flood the others.
create or replace function public.study_group_tasks_limit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.study_group_tasks where group_id = new.group_id) >= 100 then
    raise exception 'too many group tasks';
  end if;
  return new;
end $$;
drop trigger if exists study_group_tasks_limit on public.study_group_tasks;
create trigger study_group_tasks_limit before insert on public.study_group_tasks
  for each row execute function public.study_group_tasks_limit();

-- Live updates: open devices hear about changes in their groups (row level security applies).
do $$
declare t text;
begin
  foreach t in array array['study_group_items', 'study_group_members', 'study_group_tasks', 'study_group_task_done'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;
