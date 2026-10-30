-- Row-level security tests (blueprint fase 0): one user can never read or change another
-- user's rows, and someone who is not signed in sees nothing. Runs after every migration.
\set ON_ERROR_STOP 1
\set a '''00000000-0000-0000-0000-00000000000a'''
\set b '''00000000-0000-0000-0000-00000000000b'''

insert into auth.users (id, email) values (:a, 'a@test'), (:b, 'b@test');

-- 1. Every table in public has row-level security on; the private schema is closed.
do $$
declare t text;
begin
  for t in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity loop
    raise exception 'Tabel public.% heeft geen row-level security', t;
  end loop;
  if has_schema_privilege('authenticated', 'nexus_private', 'usage') or has_schema_privilege('anon', 'nexus_private', 'usage') then
    raise exception 'Het schema nexus_private is bereikbaar voor gebruikers';
  end if;
end $$;

-- 2. User A fills every table the normal way, through the apps' own rules.
set role authenticated;
set test.uid = '00000000-0000-0000-0000-00000000000a';
insert into public.notes (id, title, body, updated_at) values (gen_random_uuid(), 'A', 'geheim', 1);
insert into public.user_settings (key, value, revision) values ('profiles', '{}', 1);
insert into public.life_items (id, kind, data, updated_at) values (gen_random_uuid(), 'deadline', '{}', 1);
insert into public.devices (id, name, platform, public_key) values ('00000000-0000-0000-0000-0000000000d1', 'A pc', 'desktop', repeat('k', 88)),
  ('00000000-0000-0000-0000-0000000000d2', 'A gsm', 'android', repeat('k', 88));
insert into public.connect_messages (sender_device_id, recipient_device_id, ephemeral_key, iv, ciphertext)
  values ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000d2', 'e', 'i', 'c');
insert into public.automation_flows (id, name, definition, revision) values ('f1', 'Flow', '{"actions": [{}], "conditions": []}', 1);
insert into public.error_reports (app, message, version, build, platform) values ('Notities', 'boom', '1.0.0', 'abc', 'test');
insert into public.inbox_items (id, source, type, title, at, updated_at) values ('flow:f1|e1', 'flow', 'flow.failed', 'Flow mislukt', (extract(epoch from now()) * 1000)::bigint, 10);
-- An older change from another device does not overwrite a newer one.
update public.inbox_items set read_at = 5, updated_at = 5 where id = 'flow:f1|e1';
do $$ begin if (select read_at from public.inbox_items) is not null then raise exception 'Een oudere wijziging overschreef een nieuwere in inbox_items'; end if; end $$;
-- Items older than 60 days are cleaned up.
insert into public.inbox_items (id, source, type, title, at, updated_at) values ('oud', 'system', 'x', 'Oud', 1, 1);
do $$ begin if exists (select 1 from public.inbox_items where id = 'oud') then raise exception 'Oude inboxitems blijven staan'; end if; end $$;
select (public.create_study_group('Groep A', 'A')).id as group_id \gset
insert into public.study_group_tasks (group_id, title, due_at) values (:'group_id', 'Taak', 1);
select (public.create_team_invite(:'group_id', 'member', 24, null)).code as invite_code \gset
insert into public.team_projects (id, group_id, name) values ('00000000-0000-0000-0000-0000000000e1', :'group_id', 'Project');
insert into public.team_project_tasks (project_id, group_id, title) values ('00000000-0000-0000-0000-0000000000e1', :'group_id', 'Taak');
reset role;

-- 3. User B sees none of it and can change none of it.
set role authenticated;
set test.uid = '00000000-0000-0000-0000-00000000000b';
do $$
declare t text; n bigint;
begin
  for t in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind = 'r' loop
    execute format('select count(*) from public.%I', t) into n;
    if n > 0 then raise exception 'Gebruiker B ziet % rij(en) van A in %', n, t; end if;
    begin
      execute format('delete from public.%I', t);
      get diagnostics n = row_count;
      if n > 0 then raise exception 'Gebruiker B verwijderde % rij(en) van A in %', n, t; end if;
    exception when insufficient_privilege then null;
    end;
  end loop;
end $$;
do $$
begin
  begin
    insert into public.notes (id, user_id, title, body, updated_at) values (gen_random_uuid(), '00000000-0000-0000-0000-00000000000a', 'B', 'x', 1);
    raise exception 'Gebruiker B kon een notitie op naam van A zetten';
  exception when insufficient_privilege or check_violation then null;
  end;
  begin
    insert into public.study_group_tasks (group_id, title, due_at) select id, 'B', 1 from public.study_groups;
    -- No rows: B cannot even see the group.
  end;
end $$;
reset role;

-- 4. Not signed in: nothing at all.
set role anon;
set test.uid = '';
do $$
declare t text; n bigint;
begin
  for t in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind = 'r' loop
    begin
      execute format('select count(*) from public.%I', t) into n;
      if n > 0 then raise exception 'Zonder aanmelden zijn % rij(en) van % zichtbaar', n, t; end if;
    exception when insufficient_privilege then null;
    end;
  end loop;
end $$;
reset role;

-- 5. A still sees and keeps their own rows (the checks above did not just break everything).
set role authenticated;
set test.uid = '00000000-0000-0000-0000-00000000000a';
do $$
begin
  if (select count(*) from public.notes) <> 1 then raise exception 'A ziet de eigen notitie niet meer'; end if;
  if (select count(*) from public.study_group_tasks) <> 1 then raise exception 'A ziet de eigen groepsdeadline niet meer'; end if;
  if (select count(*) from public.error_reports) <> 1 then raise exception 'A ziet de eigen melding niet meer'; end if;
  if (select count(*) from public.inbox_items) <> 1 then raise exception 'A ziet het eigen inboxitem niet meer'; end if;
end $$;
reset role;
