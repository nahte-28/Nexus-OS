-- NEXUS Samen studeren: start a focus session and your friends and teammates join it. Everyone sees
-- the same timer (focus and break blocks counted from the start) and who studies along. Run after
-- 20261113150000_friends.sql and 20261113240000_admin.sql. Safe to run again.
--   study_sessions          one row per session; only the functions below read and write it
--   study_session_members   who joined, and when they left

create table if not exists public.study_sessions (
  id uuid primary key default gen_random_uuid(),
  host uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 60),
  focus_minutes int not null check (focus_minutes between 5 and 90),
  break_minutes int not null check (break_minutes between 1 and 30),
  started_at timestamptz not null default now(),
  ended_at timestamptz
);
create index if not exists study_sessions_open on public.study_sessions (host) where ended_at is null;

create table if not exists public.study_session_members (
  session_id uuid not null references public.study_sessions (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  primary key (session_id, user_id)
);

-- Row level security without a policy: nobody reads or writes these tables directly.
alter table public.study_sessions enable row level security;
alter table public.study_session_members enable row level security;
revoke insert, update, delete on public.study_sessions, public.study_session_members from anon, authenticated;

-- The people whose sessions you see: your friends and everyone you share a team with.
create or replace function public.study_people()
returns table (id uuid) language sql stable security definer set search_path = public as $$
  select case when f.requester = auth.uid() then f.addressee else f.requester end
  from public.friendships f
  where f.status = 'accepted' and auth.uid() in (f.requester, f.addressee)
  union
  select other.user_id
  from public.study_group_members mine
  join public.study_group_members other on other.group_id = mine.group_id
  where mine.user_id = auth.uid() and other.user_id <> auth.uid();
$$;
revoke all on function public.study_people() from public, anon, authenticated;

-- A session is open until its host ends it, and for at most 12 hours.
create or replace function public.study_session_open(p_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.study_sessions s where s.id = p_id and s.ended_at is null and s.started_at > now() - interval '12 hours');
$$;
revoke all on function public.study_session_open(uuid) from public, anon, authenticated;

-- Starts a session; you leave whatever session you were in, and one you hosted ends.
create or replace function public.start_study_session(p_title text, p_focus int, p_break int)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  new_id uuid := gen_random_uuid();
begin
  if auth.uid() is null then raise exception 'Niet aangemeld' using errcode = '42501'; end if;
  update public.study_sessions set ended_at = now() where host = auth.uid() and ended_at is null;
  update public.study_session_members set left_at = now() where user_id = auth.uid() and left_at is null;
  insert into public.study_sessions (id, host, title, focus_minutes, break_minutes)
  values (new_id, auth.uid(), coalesce(nullif(left(btrim(coalesce(p_title, '')), 60), ''), 'Samen studeren'), p_focus, p_break);
  insert into public.study_session_members (session_id, user_id) values (new_id, auth.uid());
  return new_id;
end $$;

-- Joins an open session of a friend or teammate; you leave any other session.
create or replace function public.join_study_session(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from public.study_sessions s
    where s.id = p_id and public.study_session_open(s.id)
      and (s.host = auth.uid() or s.host in (select id from public.study_people()))
  ) then
    raise exception 'Deze sessie is er niet (meer)' using errcode = '42501';
  end if;
  update public.study_session_members set left_at = now() where user_id = auth.uid() and left_at is null and session_id <> p_id;
  insert into public.study_session_members (session_id, user_id) values (p_id, auth.uid())
  on conflict (session_id, user_id) do update set left_at = null, joined_at = case when public.study_session_members.left_at is null then public.study_session_members.joined_at else now() end;
end $$;

-- Leaves a session; when the host leaves, the session ends for everyone.
create or replace function public.leave_study_session(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.study_session_members set left_at = now() where session_id = p_id and user_id = auth.uid() and left_at is null;
  update public.study_sessions set ended_at = now() where id = p_id and host = auth.uid() and ended_at is null;
end $$;

-- The open sessions you can see: yours, the ones you are in, and those of friends and teammates.
-- Names only, never e-mail addresses.
create or replace function public.study_sessions_list()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', s.id,
    'title', s.title,
    'focus', s.focus_minutes,
    'break', s.break_minutes,
    'startedAt', s.started_at,
    'host', public.nexus_display_name(s.host),
    'mine', s.host = auth.uid(),
    'joined', exists (select 1 from public.study_session_members m where m.session_id = s.id and m.user_id = auth.uid() and m.left_at is null),
    'members', (
      select coalesce(jsonb_agg(jsonb_build_object('name', public.nexus_display_name(m.user_id), 'me', m.user_id = auth.uid()) order by m.joined_at), '[]'::jsonb)
      from public.study_session_members m where m.session_id = s.id and m.left_at is null
    )
  ) order by s.started_at desc), '[]'::jsonb)
  from public.study_sessions s
  where public.study_session_open(s.id)
    and (s.host = auth.uid()
      or s.host in (select id from public.study_people())
      or exists (select 1 from public.study_session_members m where m.session_id = s.id and m.user_id = auth.uid() and m.left_at is null));
$$;

do $$
declare fn text;
begin
  foreach fn in array array['start_study_session(text, int, int)', 'join_study_session(uuid)', 'leave_study_session(uuid)', 'study_sessions_list()'] loop
    execute format('revoke all on function public.%s from public', fn);
    execute format('grant execute on function public.%s to authenticated', fn);
  end loop;
end $$;
