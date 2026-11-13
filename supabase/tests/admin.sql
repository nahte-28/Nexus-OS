-- NEXUS Beheer (20261113240000_admin.sql): only an admin gets the overview, it holds counts and
-- names but no message text, and invisible people are not counted as online.
\set ON_ERROR_STOP 1
reset role;
insert into auth.users (id, email, created_at, last_sign_in_at) values
  ('00000000-0000-0000-0000-000000000d31', 'beheer@test', now() - interval '30 days', now()),
  ('00000000-0000-0000-0000-000000000d32', 'gebruiker@test', now(), now()),
  ('00000000-0000-0000-0000-000000000d33', 'onzichtbaar@test', now(), null);
insert into public.nexus_admins (user_id) values ('00000000-0000-0000-0000-000000000d31');
insert into public.friend_profiles (user_id, display_name, code) values ('00000000-0000-0000-0000-000000000d32', 'Bram', 'BRAMBRAM'), ('00000000-0000-0000-0000-000000000d33', 'Geheim', 'GEHEMGEH');
insert into public.user_presence (user_id, state, last_seen) values
  ('00000000-0000-0000-0000-000000000d32', 'busy', now()),
  ('00000000-0000-0000-0000-000000000d33', 'invisible', now());
insert into public.error_reports (user_id, app, message, version, build, platform) values
  ('00000000-0000-0000-0000-000000000d32', 'Agenda', 'Kapot', '1.0', 'x', 'test');

set role authenticated;
set test.uid = '00000000-0000-0000-0000-000000000d32';
do $$ begin
  if public.is_nexus_admin() then raise exception 'Een gewone gebruiker is beheerder'; end if;
  begin
    perform public.admin_overview();
    raise exception 'Een gewone gebruiker kreeg het overzicht';
  exception when insufficient_privilege then null;
  end;
  if exists (select 1 from public.nexus_admins) then raise exception 'De lijst met beheerders is leesbaar'; end if;
  begin
    insert into public.nexus_admins (user_id) values (auth.uid());
    raise exception 'Jezelf beheerder maken lukte';
  exception when insufficient_privilege then null;
  end;
end $$;

set test.uid = '00000000-0000-0000-0000-000000000d31';
do $$
declare o jsonb := public.admin_overview();
begin
  if not public.is_nexus_admin() then raise exception 'De beheerder wordt niet herkend'; end if;
  if not (o->'online') @> '[{"name": "Bram", "state": "busy"}]' or (o->'online') @> '[{"name": "Geheim"}]' then
    raise exception 'Wie online is klopt niet: %', o->'online';
  end if;
  if (o->'accounts'->>'new7d')::int < 2 or (o->'errors'->>'count7d')::int < 1 then raise exception 'De tellingen kloppen niet: %', o; end if;
  if o->'errors'->'latest'->0->>'name' <> 'Bram' then raise exception 'De foutmelding heeft geen naam'; end if;
end $$;
reset role;
