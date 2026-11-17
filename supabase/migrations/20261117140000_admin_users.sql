-- NEXUS Beheer: a list of every account, also when it is offline: its name (or e-mail address
-- when it chose none), when it joined, last signed in and was last seen. Someone who chose
-- Onzichtbaar gets no "last seen". Run after 20261117120000_admin_names.sql. Safe to run again.

-- Every account, the most recently active first (at most 200). Only admin_overview calls it.
create or replace function public.admin_user_list()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce((
    select jsonb_agg(u order by s desc nulls last) from (
      select jsonb_build_object(
        'name', public.nexus_admin_name(a.id),
        'createdAt', date_trunc('minute', a.created_at),
        'lastSignIn', date_trunc('minute', a.last_sign_in_at),
        'lastSeen', case when p.state = 'invisible' then null else date_trunc('minute', p.last_seen) end,
        'online', coalesce(p.state <> 'invisible' and p.last_seen > now() - interval '3 minutes', false)
      ) as u,
      greatest(case when p.state = 'invisible' then null else p.last_seen end, a.last_sign_in_at, a.created_at) as s
      from auth.users a left join public.user_presence p on p.user_id = a.id
      order by s desc nulls last
      limit 200
    ) x
  ), '[]'::jsonb);
$$;
revoke all on function public.admin_user_list() from public, anon, authenticated;

-- Everything Beheer shows, in one call; refused for anyone who is not an admin. Someone who
-- chose Onzichtbaar is not counted as online.
create or replace function public.admin_overview()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_nexus_admin() then
    raise exception 'not an admin' using errcode = '42501';
  end if;
  return (
    with seen as (
      select p.user_id, p.state, p.last_seen from public.user_presence p where p.state <> 'invisible'
    )
    select jsonb_build_object(
      'at', now(),
      'accounts', jsonb_build_object(
        'total', (select count(*) from auth.users),
        'new7d', (select count(*) from auth.users where created_at > now() - interval '7 days'),
        'signedIn7d', (select count(*) from auth.users where last_sign_in_at > now() - interval '7 days'),
        'active24h', (select count(*) from public.user_presence where last_seen > now() - interval '24 hours'),
        'active7d', (select count(*) from public.user_presence where last_seen > now() - interval '7 days')
      ),
      'online', coalesce((
        select jsonb_agg(jsonb_build_object('name', public.nexus_admin_name(s.user_id), 'state', s.state, 'lastSeen', date_trunc('minute', s.last_seen)) order by s.last_seen desc)
        from seen s where s.last_seen > now() - interval '3 minutes'
      ), '[]'::jsonb),
      'users', public.admin_user_list(),
      'devices', coalesce((
        select jsonb_object_agg(platform, n) from (
          select platform, count(*) as n from public.devices where revoked_at is null and last_seen_at > now() - interval '30 days' group by platform
        ) d
      ), '{}'::jsonb),
      'teams', coalesce((
        select jsonb_agg(t order by t->>'name') from (
          select jsonb_build_object(
            'name', g.name,
            'members', (select count(*) from public.study_group_members m where m.group_id = g.id),
            'online', (select count(*) from public.study_group_members m join seen s on s.user_id = m.user_id where m.group_id = g.id and s.last_seen > now() - interval '3 minutes'),
            'messages7d', (select count(*) from public.team_messages c where c.group_id = g.id and c.created_at > now() - interval '7 days'),
            'createdAt', g.created_at
          ) as t
          from public.study_groups g
          order by g.created_at desc
          limit 100
        ) x
      ), '[]'::jsonb),
      'activity', jsonb_build_object(
        'friendships', (select count(*) from public.friendships where status = 'accepted'),
        'requests', (select count(*) from public.friendships where status = 'pending'),
        'teamMessages7d', (select count(*) from public.team_messages where created_at > now() - interval '7 days'),
        'comments7d', (select count(*) from public.team_task_comments where created_at > now() - interval '7 days'),
        'directMessages7d', (select count(*) from public.dm_messages where created_at > now() - interval '7 days')
      ),
      'errors', jsonb_build_object(
        'count7d', (select count(*) from public.error_reports where created_at > now() - interval '7 days'),
        'latest', coalesce((
          select jsonb_agg(jsonb_build_object('at', e.created_at, 'app', e.app, 'message', e.message, 'note', e.note, 'version', e.version, 'name', public.nexus_admin_name(e.user_id)) order by e.created_at desc)
          from (select * from public.error_reports order by created_at desc limit 20) e
        ), '[]'::jsonb)
      )
    )
  );
end $$;

revoke all on function public.admin_overview() from public;
grant execute on function public.admin_overview() to authenticated;
