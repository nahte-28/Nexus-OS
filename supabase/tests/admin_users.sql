-- NEXUS Beheer (20261117140000_admin_users.sql): every account is listed, also offline, and someone
-- who chose Onzichtbaar has no "last seen".
\set ON_ERROR_STOP 1
set role authenticated;
set test.uid = '00000000-0000-0000-0000-000000000d31';
do $$
declare
  o jsonb := public.admin_overview();
  bram jsonb := (select u from jsonb_array_elements(o->'users') u where u->>'name' = 'Bram');
  geheim jsonb := (select u from jsonb_array_elements(o->'users') u where u->>'name' = 'Geheim');
  beheer jsonb := (select u from jsonb_array_elements(o->'users') u where u->>'name' = 'beheer@test');
begin
  if bram is null or geheim is null or beheer is null then raise exception 'Niet elk account staat in de lijst: %', o->'users'; end if;
  if (bram->>'online')::boolean is not true or bram->>'lastSeen' is null then raise exception 'Bram staat niet als online: %', bram; end if;
  if (geheim->>'online')::boolean or geheim->>'lastSeen' is not null then raise exception 'Onzichtbaar toont toch wanneer: %', geheim; end if;
  if (beheer->>'online')::boolean or beheer->>'createdAt' is null then raise exception 'Een account zonder status klopt niet: %', beheer; end if;
end $$;
reset role;
set role authenticated;
set test.uid = '00000000-0000-0000-0000-000000000d32';
do $$ begin
  begin
    perform public.admin_user_list();
    raise exception 'Een gewone gebruiker kan de lijst van accounts opvragen';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
