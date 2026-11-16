-- NEXUS Afspraak met vrienden (20261116180000_appointment_invites.sql): only a friend can be
-- invited, only the two of them see the invite, the friend answers and the host's changes and
-- cancelling reach the invite, and nobody writes the table directly.
\set ON_ERROR_STOP 1
reset role;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000a91', 'ai-host@test'), ('00000000-0000-0000-0000-000000000a92', 'ai-vriend@test'),
  ('00000000-0000-0000-0000-000000000a93', 'ai-vreemde@test');
insert into public.friend_profiles (user_id, display_name, code) values
  ('00000000-0000-0000-0000-000000000a91', 'Ethan', 'AFSPHSTX'), ('00000000-0000-0000-0000-000000000a92', 'Remo', 'AFSPVRND');
insert into public.friendships (requester, addressee, status, accepted_at) values
  ('00000000-0000-0000-0000-000000000a91', '00000000-0000-0000-0000-000000000a92', 'accepted', now());

create temp table if not exists invite_ids (id uuid);
grant all on invite_ids to authenticated;

-- 1. Inviting: a friend yes, someone else no, and no direct writes.
set role authenticated;
set test.uid = '00000000-0000-0000-0000-000000000a91';
insert into invite_ids select public.appointment_invite('00000000-0000-0000-0000-000000000a92', '00000000-0000-0000-0000-0000000000b1', 'Samen studeren', now() + interval '1 day', now() + interval '1 day 2 hours', 'Bib', '');
do $$ begin
  begin
    perform public.appointment_invite('00000000-0000-0000-0000-000000000a93', '00000000-0000-0000-0000-0000000000b1', 'Samen studeren', now() + interval '1 day', now() + interval '1 day 2 hours', '', '');
    raise exception 'Een vreemde uitnodigen lukte';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.appointment_invites (host, guest, host_name, guest_name, host_item, title, start_at, end_at) values ('00000000-0000-0000-0000-000000000a91', '00000000-0000-0000-0000-000000000a93', 'a', 'b', gen_random_uuid(), 'x', now(), now());
    raise exception 'Rechtstreeks schrijven lukte';
  exception when insufficient_privilege then null;
  end;
  if (select public.appointment_invites_list() -> 0 ->> 'side') <> 'host' then raise exception 'De host ziet zijn uitnodiging niet'; end if;
  if (select public.appointment_invites_list() -> 0 ->> 'otherName') <> 'Remo' then raise exception 'De naam van de vriend klopt niet'; end if;
  -- The host cannot answer for the friend.
  begin
    perform public.appointment_invite_answer((select id from invite_ids), true);
    raise exception 'De host aanvaardde zelf';
  exception when insufficient_privilege then null;
  end;
end $$;

-- 2. Someone else sees nothing.
set test.uid = '00000000-0000-0000-0000-000000000a93';
do $$ begin
  if jsonb_array_length(public.appointment_invites_list()) <> 0 then raise exception 'Een vreemde ziet de uitnodiging'; end if;
  if (select count(*) from public.appointment_invites) <> 0 then raise exception 'Een vreemde leest de tabel'; end if;
end $$;

-- 3. The friend accepts and sees the host's name.
set test.uid = '00000000-0000-0000-0000-000000000a92';
select public.appointment_invite_answer((select id from invite_ids), true);
do $$ begin
  if (select public.appointment_invites_list() -> 0 ->> 'status') <> 'accepted' then raise exception 'Aanvaarden telde niet'; end if;
  if (select public.appointment_invites_list() -> 0 ->> 'otherName') <> 'Ethan' then raise exception 'De gast ziet de naam van de host niet'; end if;
  -- The friend cannot change or cancel the host's appointment.
  if public.appointment_invite_update('00000000-0000-0000-0000-0000000000b1', 'Anders', now(), now(), '', '') <> 0 then raise exception 'De gast veranderde de afspraak'; end if;
  if public.appointment_invite_cancel('00000000-0000-0000-0000-0000000000b1', null) <> 0 then raise exception 'De gast annuleerde de afspraak'; end if;
end $$;

-- 4. The host changes the appointment (once, not again when nothing changed) and then cancels it.
set test.uid = '00000000-0000-0000-0000-000000000a91';
do $$
declare
  start_at timestamptz := now() + interval '2 days';
begin
  if public.appointment_invite_update('00000000-0000-0000-0000-0000000000b1', 'Samen studeren (verzet)', start_at, start_at + interval '1 hour', 'Bib', '') <> 1 then raise exception 'De wijziging kwam niet door'; end if;
  if public.appointment_invite_update('00000000-0000-0000-0000-0000000000b1', 'Samen studeren (verzet)', start_at, start_at + interval '1 hour', 'Bib', '') <> 0 then raise exception 'Dezelfde wijziging telde opnieuw'; end if;
  if (select public.appointment_invites_list() -> 0 ->> 'status') <> 'accepted' then raise exception 'Een wijziging zette de status terug'; end if;
  if public.appointment_invite_cancel('00000000-0000-0000-0000-0000000000b1', null) <> 1 then raise exception 'Annuleren lukte niet'; end if;
end $$;

-- 5. A cancelled invite cannot be accepted; inviting again opens it.
set test.uid = '00000000-0000-0000-0000-000000000a92';
do $$ begin
  begin
    perform public.appointment_invite_answer((select id from invite_ids), true);
    raise exception 'Een geannuleerde uitnodiging aanvaarden lukte';
  exception when insufficient_privilege then null;
  end;
end $$;
set test.uid = '00000000-0000-0000-0000-000000000a91';
do $$ begin
  if public.appointment_invite('00000000-0000-0000-0000-000000000a92', '00000000-0000-0000-0000-0000000000b1', 'Samen studeren', now() + interval '1 day', now() + interval '1 day 2 hours', '', '') <> (select id from invite_ids) then raise exception 'Opnieuw uitnodigen maakte een tweede rij'; end if;
  if (select public.appointment_invites_list() -> 0 ->> 'status') <> 'invited' then raise exception 'Opnieuw uitnodigen opende ze niet'; end if;
end $$;
reset role;
