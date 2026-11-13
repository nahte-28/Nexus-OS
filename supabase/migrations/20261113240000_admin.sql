-- NEXUS Beheer: an overview for the owner of this NEXUS (accounts, who is online, devices,
-- teams, activity and error reports) in the Beheer app. Only counts and names, never the text
-- of notes, messages, comments or files. Run after 20261113210000_presence.sql. Safe to run again.
--   nexus_admins   who sees Beheer; nobody reads or changes it through the app
--
-- The oldest account becomes the first admin. Add someone else in the SQL Editor with:
--   insert into public.nexus_admins (user_id) select id from auth.users where email = 'naam@voorbeeld.be';

create table if not exists public.nexus_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  added_at timestamptz not null default now()
);
alter table public.nexus_admins enable row level security;
-- Row level security without a policy: through the app nobody sees a row.
revoke insert, update, delete on public.nexus_admins from anon, authenticated;

insert into public.nexus_admins (user_id)
select id from auth.users where not exists (select 1 from public.nexus_admins) order by created_at limit 1;

create or replace function public.is_nexus_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.nexus_admins where user_id = auth.uid());
$$;

-- A name for someone in the overview: their name for friends, else their name in a team.
create or replace function public.nexus_display_name(p_user uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce(
    (select display_name from public.friend_profiles where user_id = p_user),
    (select display_name from public.study_group_members where user_id = p_user order by joined_at limit 1),
    'Zonder naam'
  );
$$;
revoke all on function public.nexus_display_name(uuid) from public, anon, authenticated;

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
        select jsonb_agg(jsonb_build_object('name', public.nexus_display_name(s.user_id), 'state', s.state, 'lastSeen', date_trunc('minute', s.last_seen)) order by s.last_seen desc)
        from seen s where s.last_seen > now() - interval '3 minutes'
      ), '[]'::jsonb),
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
          select jsonb_agg(jsonb_build_object('at', e.created_at, 'app', e.app, 'message', e.message, 'note', e.note, 'version', e.version, 'name', public.nexus_display_name(e.user_id)) order by e.created_at desc)
          from (select * from public.error_reports order by created_at desc limit 20) e
        ), '[]'::jsonb)
      )
    )
  );
end $$;

do $$
declare fn text;
begin
  foreach fn in array array['is_nexus_admin()', 'admin_overview()'] loop
    execute format('revoke all on function public.%s from public', fn);
    execute format('grant execute on function public.%s to authenticated', fn);
  end loop;
end $$;
