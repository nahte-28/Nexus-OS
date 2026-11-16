-- NEXUS Notities delen: you share one of your notes with friends or with a team, to read or to edit
-- along. The shared copy lives here; your own note in Notities and the copy keep each other up to
-- date (apps/web/src/notes/shares.ts). Run after 20261113150000_friends.sql,
-- 20261030150000_teams.sql and 20261113240000_admin.sql. Safe to run again.
--   note_shares        one row per shared note: the text, with a revision that goes up on each save
--   note_share_access  who may read it: a friend or a team, and whether they may edit
-- Both are read through the policies below and written only by the functions below.

create table if not exists public.note_shares (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references auth.users (id) on delete cascade,
  owner_name text not null check (char_length(owner_name) between 1 and 40),
  -- The id of the note in the owner's own Notities.
  note_id uuid not null,
  title text not null default '' check (char_length(title) <= 200),
  body text not null default '' check (char_length(body) <= 100000),
  revision int not null default 1,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  updated_by_name text not null default '' check (char_length(updated_by_name) <= 40),
  created_at timestamptz not null default now(),
  unique (owner, note_id)
);

create table if not exists public.note_share_access (
  share_id uuid not null references public.note_shares (id) on delete cascade,
  user_id uuid references auth.users (id) on delete cascade,
  group_id uuid references public.study_groups (id) on delete cascade,
  can_edit boolean not null default false,
  created_at timestamptz not null default now(),
  check ((user_id is null) <> (group_id is null))
);
create unique index if not exists note_share_access_user on public.note_share_access (share_id, user_id) where user_id is not null;
create unique index if not exists note_share_access_group on public.note_share_access (share_id, group_id) where group_id is not null;
create index if not exists note_share_access_by_user on public.note_share_access (user_id) where user_id is not null;
create index if not exists note_share_access_by_group on public.note_share_access (group_id) where group_id is not null;

alter table public.note_shares enable row level security;
alter table public.note_share_access enable row level security;
revoke insert, update, delete on public.note_shares from anon, authenticated;
revoke insert, update, delete on public.note_share_access from anon, authenticated;

-- What the caller may do with a shared note: 'owner', 'edit', 'read' or null. A team viewer reads only.
create or replace function public.note_share_right(p_share uuid)
returns text language sql stable security definer set search_path = public as $$
  select case
    when exists (select 1 from public.note_shares s where s.id = p_share and s.owner = auth.uid()) then 'owner'
    when exists (
      select 1 from public.note_share_access a
      left join public.study_group_members m on m.group_id = a.group_id and m.user_id = auth.uid()
      where a.share_id = p_share and a.can_edit and (a.user_id = auth.uid() or (m.user_id is not null and m.role <> 'viewer'))
    ) then 'edit'
    when exists (
      select 1 from public.note_share_access a
      left join public.study_group_members m on m.group_id = a.group_id and m.user_id = auth.uid()
      where a.share_id = p_share and (a.user_id = auth.uid() or m.user_id is not null)
    ) then 'read'
  end;
$$;
revoke all on function public.note_share_right(uuid) from public, anon;
grant execute on function public.note_share_right(uuid) to authenticated;

drop policy if exists "note_shares read" on public.note_shares;
create policy "note_shares read" on public.note_shares for select to authenticated using (public.note_share_right(id) is not null);
drop policy if exists "note_share_access read" on public.note_share_access;
create policy "note_share_access read" on public.note_share_access for select to authenticated using (public.note_share_right(share_id) = 'owner');

-- Shares your note [p_note] (once; sharing it again returns the same share). At most 100 shares.
create or replace function public.note_share_create(p_note uuid, p_title text, p_body text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  result uuid;
begin
  if auth.uid() is null then raise exception 'Niet aangemeld' using errcode = '42501'; end if;
  select id into result from public.note_shares where owner = auth.uid() and note_id = p_note;
  if result is not null then return result; end if;
  if (select count(*) from public.note_shares where owner = auth.uid()) >= 100 then
    raise exception 'Je deelt al 100 notities' using errcode = '54000';
  end if;
  if char_length(coalesce(p_body, '')) > 100000 then raise exception 'Deze notitie is te lang om te delen' using errcode = '22001'; end if;
  insert into public.note_shares (owner, owner_name, note_id, title, body, updated_by, updated_by_name)
  values (auth.uid(), left(public.nexus_display_name(auth.uid()), 40), p_note, left(coalesce(p_title, ''), 200), coalesce(p_body, ''), auth.uid(), left(public.nexus_display_name(auth.uid()), 40))
  returning id into result;
  return result;
end $$;

-- Gives a friend (p_user) or a team you are in (p_group) access, or changes whether they may edit.
create or replace function public.note_share_grant(p_share uuid, p_user uuid, p_group uuid, p_edit boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.note_share_right(p_share) is distinct from 'owner' then raise exception 'Deze gedeelde notitie is er niet (meer)' using errcode = '42501'; end if;
  if (p_user is null) = (p_group is null) then raise exception 'Kies een vriend of een team' using errcode = '22023'; end if;
  if p_user is not null and not exists (
    select 1 from public.friendships f
    where f.status = 'accepted' and ((f.requester = auth.uid() and f.addressee = p_user) or (f.addressee = auth.uid() and f.requester = p_user))
  ) then
    raise exception 'Je kunt alleen met een vriend delen' using errcode = '42501';
  end if;
  if p_group is not null and not exists (select 1 from public.study_group_members where group_id = p_group and user_id = auth.uid()) then
    raise exception 'Je kunt alleen delen met een team waar je in zit' using errcode = '42501';
  end if;
  if (select count(*) from public.note_share_access where share_id = p_share) >= 50
    and not exists (select 1 from public.note_share_access where share_id = p_share and (user_id = p_user or group_id = p_group)) then
    raise exception 'Je kunt een notitie met hoogstens 50 vrienden of teams delen' using errcode = '54000';
  end if;
  if p_user is not null then
    insert into public.note_share_access (share_id, user_id, can_edit) values (p_share, p_user, coalesce(p_edit, false))
    on conflict (share_id, user_id) where user_id is not null do update set can_edit = excluded.can_edit;
  else
    insert into public.note_share_access (share_id, group_id, can_edit) values (p_share, p_group, coalesce(p_edit, false))
    on conflict (share_id, group_id) where group_id is not null do update set can_edit = excluded.can_edit;
  end if;
  -- So the people it is shared with see it at once (Realtime follows note_shares).
  update public.note_shares set updated_at = now() where id = p_share;
end $$;

-- Takes access back from a friend or a team.
create or replace function public.note_share_revoke(p_share uuid, p_user uuid, p_group uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.note_share_right(p_share) is distinct from 'owner' then raise exception 'Deze gedeelde notitie is er niet (meer)' using errcode = '42501'; end if;
  delete from public.note_share_access where share_id = p_share and ((p_user is not null and user_id = p_user) or (p_group is not null and group_id = p_group));
  update public.note_shares set updated_at = now() where id = p_share;
end $$;

-- Saves the text. [p_revision] is the revision you saw: when someone saved in the meantime, it no
-- longer matches and nothing changes. Returns the new revision.
create or replace function public.note_share_save(p_share uuid, p_revision int, p_title text, p_body text)
returns int language plpgsql security definer set search_path = public as $$
declare
  n int;
begin
  if coalesce(public.note_share_right(p_share), '') not in ('owner', 'edit') then
    raise exception 'Je mag deze notitie niet bewerken' using errcode = '42501';
  end if;
  if char_length(coalesce(p_body, '')) > 100000 then raise exception 'Deze notitie is te lang om te delen' using errcode = '22001'; end if;
  update public.note_shares set title = left(coalesce(p_title, ''), 200), body = coalesce(p_body, ''), revision = revision + 1,
    updated_at = now(), updated_by = auth.uid(), updated_by_name = left(public.nexus_display_name(auth.uid()), 40)
  where id = p_share and revision = p_revision
  returning revision into n;
  if n is null then raise exception 'De notitie is intussen veranderd' using errcode = '40001'; end if;
  return n;
end $$;

-- Stops sharing: the copy goes for everyone; your own note stays.
create or replace function public.note_share_delete(p_share uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.note_shares where id = p_share and owner = auth.uid();
end $$;

-- Your shared notes and the ones shared with you, newest first, each with what you may do.
create or replace function public.note_shares_list()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', s.id,
    'right', s.right_now,
    'noteId', case when s.right_now = 'owner' then s.note_id end,
    'ownerName', s.owner_name,
    'title', s.title,
    'body', s.body,
    'revision', s.revision,
    'updatedAt', s.updated_at,
    'updatedByMe', s.updated_by = auth.uid(),
    'updatedByName', s.updated_by_name,
    'access', case when s.right_now = 'owner' then (
      select coalesce(jsonb_agg(jsonb_build_object(
        'user', a.user_id,
        'group', a.group_id,
        'name', case when a.user_id is not null then left(public.nexus_display_name(a.user_id), 40) else (select name from public.study_groups g where g.id = a.group_id) end,
        'canEdit', a.can_edit
      ) order by a.created_at), '[]'::jsonb)
      from public.note_share_access a where a.share_id = s.id
    ) else '[]'::jsonb end
  ) order by s.updated_at desc), '[]'::jsonb)
  from (
    select x.*, public.note_share_right(x.id) as right_now from public.note_shares x
    where public.note_share_right(x.id) is not null
    order by x.updated_at desc limit 200
  ) s;
$$;

do $$
declare fn text;
begin
  foreach fn in array array[
    'note_share_create(uuid, text, text)',
    'note_share_grant(uuid, uuid, uuid, boolean)',
    'note_share_revoke(uuid, uuid, uuid)',
    'note_share_save(uuid, int, text, text)',
    'note_share_delete(uuid)',
    'note_shares_list()'
  ] loop
    execute format('revoke all on function public.%s from public', fn);
    execute format('grant execute on function public.%s to authenticated', fn);
  end loop;
end $$;

-- Live for everyone it is shared with (row level security applies).
do $$
begin
  alter publication supabase_realtime add table public.note_shares;
exception when duplicate_object then null;
end $$;
