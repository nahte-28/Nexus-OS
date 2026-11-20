-- NEXUS Teams: a notice on your phones and watch when someone else puts a task on your name,
-- also when NEXUS is closed there. Uses the web push of 20261116090000_message_push.sql and
-- follows its "Teamchat" switch (Apparaten › Meldingen op dit toestel).
-- Run after 20261030150000_teams.sql and 20261116090000_message_push.sql. Safe to run again.

create or replace function public.team_task_assigned_push() returns trigger
language plpgsql security definer set search_path = public, nexus_private as $$
declare
  v_project text;
  v_name text;
  v_by uuid := coalesce(auth.uid(), new.updated_by);
begin
  if new.assignee is null or new.status = 'done' or new.assignee = v_by then
    return null;
  end if;
  if tg_op = 'UPDATE' and old.assignee is not distinct from new.assignee then
    return null;
  end if;
  begin
    if not coalesce((select mp.team from public.message_push mp where mp.user_id = new.assignee), true) then
      return null;
    end if;
    v_project := coalesce((select p.name from public.team_projects p where p.id = new.project_id), 'een teamproject');
    v_name := coalesce((select m.display_name from public.study_group_members m where m.group_id = new.group_id and m.user_id = v_by), 'Iemand');
    insert into public.push_schedule (user_id, sender_device_id, recipient_device_id, ref, at, extra)
    select new.assignee, p.device_id, p.device_id, 'team-task:' || new.id || ':' || extract(epoch from now())::bigint, now(),
           jsonb_build_object('kind', 'system', 'title', 'Nieuwe teamtaak voor jou',
                              'text', left(v_name || ' zette "' || new.title || '" (' || v_project || ') op jouw naam.', 400),
                              'tag', 'team-task:' || new.id)
      from public.push_subscriptions p
      join public.devices d on d.id = p.device_id
     where p.user_id = new.assignee and d.revoked_at is null
    on conflict (recipient_device_id, ref) do nothing;
    perform nexus_private.dispatch_push();
  exception when others then
    -- A notice that cannot be planned never stops the change to the task.
    null;
  end;
  return null;
end $$;
revoke all on function public.team_task_assigned_push() from public, anon, authenticated;
drop trigger if exists team_task_assigned_push on public.team_project_tasks;
create trigger team_task_assigned_push after insert or update of assignee on public.team_project_tasks
  for each row execute function public.team_task_assigned_push();
