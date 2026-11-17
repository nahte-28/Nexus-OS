-- NEXUS Beheer (20261117120000_admin_names.sql): someone without a name shows up with their e-mail
-- address in Beheer, but friends and teams still never see it.
\set ON_ERROR_STOP 1
reset role;
insert into auth.users (id, email, created_at, last_sign_in_at) values
  ('00000000-0000-0000-0000-000000000d41', 'zondernaam@test', now(), now());
insert into public.user_presence (user_id, state, last_seen) values ('00000000-0000-0000-0000-000000000d41', 'available', now());

set role authenticated;
set test.uid = '00000000-0000-0000-0000-000000000d31';
do $$
declare o jsonb := public.admin_overview();
begin
  if not (o->'online') @> '[{"name": "zondernaam@test"}]' then raise exception 'Beheer toont het e-mailadres niet: %', o->'online'; end if;
  if not (o->'online') @> '[{"name": "Bram"}]' then raise exception 'Wie een naam koos, toont die niet meer: %', o->'online'; end if;
end $$;
reset role;
do $$ begin
  if public.nexus_display_name('00000000-0000-0000-0000-000000000d41') <> 'Zonder naam' then raise exception 'Vrienden en teams zien het e-mailadres'; end if;
end $$;
set role authenticated;
set test.uid = '00000000-0000-0000-0000-000000000d41';
do $$ begin
  begin
    perform public.nexus_admin_name('00000000-0000-0000-0000-000000000d31');
    raise exception 'Een gewone gebruiker kan e-mailadressen opvragen';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
