-- NEXUS Notities delen (20261116210000_note_shares.sql): only friends and your own teams get
-- access, readers cannot save, a stale save changes nothing, a team viewer only reads, and nobody
-- writes the tables directly.
\set ON_ERROR_STOP 1
reset role;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000e91', 'ns-eigen@test'), ('00000000-0000-0000-0000-000000000e92', 'ns-vriend@test'),
  ('00000000-0000-0000-0000-000000000e93', 'ns-vreemde@test'), ('00000000-0000-0000-0000-000000000e94', 'ns-teamlid@test'),
  ('00000000-0000-0000-0000-000000000e95', 'ns-kijker@test');
insert into public.friend_profiles (user_id, display_name, code) values
  ('00000000-0000-0000-0000-000000000e91', 'Ethan', 'NTSHEGNX'), ('00000000-0000-0000-0000-000000000e92', 'Remo', 'NTSHVRND');
insert into public.friendships (requester, addressee, status, accepted_at) values
  ('00000000-0000-0000-0000-000000000e91', '00000000-0000-0000-0000-000000000e92', 'accepted', now());
insert into public.study_groups (id, name, invite_code, created_by) values ('00000000-0000-0000-0000-0000000000f1', 'Labogroep', 'NTSHGRPX', '00000000-0000-0000-0000-000000000e91');
insert into public.study_group_members (group_id, user_id, display_name, role) values
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-000000000e91', 'Ethan', 'owner'),
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-000000000e94', 'Lotte', 'member'),
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-000000000e95', 'Kijker', 'viewer');

create temp table if not exists share_ids (id uuid);
grant all on share_ids to authenticated;

-- 1. Sharing: once per note, with a friend and a team, not with a stranger, no direct writes.
set role authenticated;
set test.uid = '00000000-0000-0000-0000-000000000e91';
insert into share_ids select public.note_share_create('00000000-0000-0000-0000-0000000000c1', 'Samenvatting', 'Hoofdstuk 1');
do $$ begin
  if public.note_share_create('00000000-0000-0000-0000-0000000000c1', 'x', 'y') <> (select id from share_ids) then raise exception 'Opnieuw delen maakte een tweede'; end if;
  perform public.note_share_grant((select id from share_ids), '00000000-0000-0000-0000-000000000e92', null, false);
  perform public.note_share_grant((select id from share_ids), null, '00000000-0000-0000-0000-0000000000f1', true);
  begin
    perform public.note_share_grant((select id from share_ids), '00000000-0000-0000-0000-000000000e93', null, false);
    raise exception 'Delen met een vreemde lukte';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.note_shares (owner, owner_name, note_id) values ('00000000-0000-0000-0000-000000000e93', 'x', gen_random_uuid());
    raise exception 'Rechtstreeks schrijven lukte';
  exception when insufficient_privilege then null;
  end;
  if jsonb_array_length(public.note_shares_list() -> 0 -> 'access') <> 2 then raise exception 'De eigenaar ziet niet met wie hij deelt'; end if;
  if (select public.note_shares_list() -> 0 ->> 'right') <> 'owner' then raise exception 'De eigenaar is geen eigenaar'; end if;
end $$;

-- 2. The friend reads but cannot save, and does not see who else has access.
set test.uid = '00000000-0000-0000-0000-000000000e92';
do $$ begin
  if (select public.note_shares_list() -> 0 ->> 'right') <> 'read' then raise exception 'De vriend kan niet lezen'; end if;
  if (select public.note_shares_list() -> 0 ->> 'body') <> 'Hoofdstuk 1' then raise exception 'De tekst kwam niet mee'; end if;
  if (select public.note_shares_list() -> 0 ->> 'noteId') is not null then raise exception 'De vriend ziet het id van de eigen notitie'; end if;
  if (select count(*) from public.note_share_access) <> 0 then raise exception 'De vriend leest de toegang'; end if;
  begin
    perform public.note_share_save((select id from share_ids), 1, 'x', 'y');
    raise exception 'Een lezer kon opslaan';
  exception when insufficient_privilege then null;
  end;
end $$;

-- 3. A team member edits; a stale revision changes nothing. A team viewer only reads.
set test.uid = '00000000-0000-0000-0000-000000000e94';
do $$ begin
  if (select public.note_shares_list() -> 0 ->> 'right') <> 'edit' then raise exception 'Het teamlid kan niet bewerken'; end if;
  if public.note_share_save((select id from share_ids), 1, 'Samenvatting', 'Hoofdstuk 1 en 2') <> 2 then raise exception 'Opslaan telde niet'; end if;
  begin
    perform public.note_share_save((select id from share_ids), 1, 'Samenvatting', 'Oud');
    raise exception 'Een oude versie overschreef de nieuwe';
  exception when serialization_failure then null;
  end;
end $$;
set test.uid = '00000000-0000-0000-0000-000000000e95';
do $$ begin
  if (select public.note_shares_list() -> 0 ->> 'right') <> 'read' then raise exception 'Een kijker in het team mag bewerken'; end if;
end $$;

-- 4. A stranger sees nothing.
set test.uid = '00000000-0000-0000-0000-000000000e93';
do $$ begin
  if jsonb_array_length(public.note_shares_list()) <> 0 then raise exception 'Een vreemde ziet de notitie'; end if;
  if (select count(*) from public.note_shares) <> 0 then raise exception 'Een vreemde leest de tabel'; end if;
end $$;

-- 5. The owner sees who saved, takes the friend's access back and stops sharing.
set test.uid = '00000000-0000-0000-0000-000000000e91';
do $$ begin
  if (select public.note_shares_list() -> 0 ->> 'updatedByName') <> 'Lotte' then raise exception 'De eigenaar ziet niet wie opsloeg'; end if;
  perform public.note_share_revoke((select id from share_ids), '00000000-0000-0000-0000-000000000e92', null);
  if jsonb_array_length(public.note_shares_list() -> 0 -> 'access') <> 1 then raise exception 'Intrekken lukte niet'; end if;
end $$;
set test.uid = '00000000-0000-0000-0000-000000000e92';
do $$ begin
  if jsonb_array_length(public.note_shares_list()) <> 0 then raise exception 'De vriend ziet de notitie nog'; end if;
end $$;
set test.uid = '00000000-0000-0000-0000-000000000e94';
do $$ begin
  -- Only the owner can stop sharing.
  perform public.note_share_delete((select id from share_ids));
  if jsonb_array_length(public.note_shares_list()) <> 1 then raise exception 'Een teamlid stopte het delen'; end if;
end $$;
set test.uid = '00000000-0000-0000-0000-000000000e91';
select public.note_share_delete((select id from share_ids));
do $$ begin
  if jsonb_array_length(public.note_shares_list()) <> 0 then raise exception 'Stoppen met delen lukte niet'; end if;
end $$;
reset role;
