-- NEXUS Verjaardagen (20261118090000_birthdays.sql): friends see your day and month only when you
-- share it, Beheer sees every birthday, and on the day NEXUS sends the jarige and their friends a
-- message once, with a push to their phones.
\set ON_ERROR_STOP 1
reset role;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000b71', 'bd-jarig@test'), ('00000000-0000-0000-0000-000000000b72', 'bd-vriend@test'),
  ('00000000-0000-0000-0000-000000000b73', 'bd-vreemde@test'), ('00000000-0000-0000-0000-000000000b74', 'bd-stil@test');
insert into public.friend_profiles (user_id, display_name, code) values
  ('00000000-0000-0000-0000-000000000b71', 'Jarige', 'BDAYJRGA'), ('00000000-0000-0000-0000-000000000b72', 'Vriend', 'BDAYVRDB'),
  ('00000000-0000-0000-0000-000000000b74', 'Stil', 'BDAYSTLC');
insert into public.friendships (requester, addressee, status, accepted_at) values
  ('00000000-0000-0000-0000-000000000b71', '00000000-0000-0000-0000-000000000b72', 'accepted', now()),
  ('00000000-0000-0000-0000-000000000b74', '00000000-0000-0000-0000-000000000b72', 'accepted', now());

-- 1. Saving goes only through set_birthday.
set role authenticated;
set test.uid = '00000000-0000-0000-0000-000000000b71';
select public.set_birthday('03-14', true);
do $$ begin
  begin
    insert into public.birthdays (user_id, month_day) values ('00000000-0000-0000-0000-000000000b73', '01-01');
    raise exception 'Rechtstreeks schrijven lukte';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.set_birthday('13-40', true);
    raise exception 'Een foute datum werd aanvaard';
  exception when invalid_parameter_value then null;
  end;
  begin
    insert into public.system_messages (user_id, ref, kind, title, body) values (auth.uid(), 'x', 'birthday', 'x', 'x');
    raise exception 'Zelf een systeembericht schrijven lukte';
  exception when insufficient_privilege then null;
  end;
end $$;
set test.uid = '00000000-0000-0000-0000-000000000b74';
select public.set_birthday('03-14', false);

-- 2. A friend sees the shared birthday, not the hidden one; a stranger sees none.
set test.uid = '00000000-0000-0000-0000-000000000b72';
do $$
declare b jsonb := public.friend_birthdays();
begin
  if jsonb_array_length(b) <> 1 or b -> 0 ->> 'monthDay' <> '03-14' or b -> 0 ->> 'name' <> 'Jarige' then raise exception 'Een vriend ziet de verjaardagen niet juist: %', b; end if;
  if (select count(*) from public.birthdays) <> 0 then raise exception 'Een vriend leest de tabel'; end if;
  begin
    perform public.admin_birthdays();
    raise exception 'Een gewone gebruiker ziet alle verjaardagen';
  exception when insufficient_privilege then null;
  end;
end $$;
set test.uid = '00000000-0000-0000-0000-000000000b73';
do $$ begin
  if jsonb_array_length(public.friend_birthdays()) <> 0 then raise exception 'Een vreemde ziet een verjaardag'; end if;
end $$;

-- 3. Beheer sees both.
set test.uid = '00000000-0000-0000-0000-000000000d31';
do $$ begin
  if (select count(*) from jsonb_array_elements(public.admin_birthdays()) x where x ->> 'monthDay' = '03-14') <> 2 then raise exception 'Beheer ziet niet elke verjaardag'; end if;
end $$;

-- 4. Before 08:00 nothing, then the greetings, only once.
reset role;
insert into public.devices (id, user_id, name, platform, public_key)
  values ('00000000-0000-0000-0000-00000000db71', '00000000-0000-0000-0000-000000000b71', 'Gsm', 'web', repeat('k', 88));
insert into public.push_subscriptions (device_id, user_id, endpoint, p256dh, auth)
  values ('00000000-0000-0000-0000-00000000db71', '00000000-0000-0000-0000-000000000b71', 'https://push.test/bd', 'p', 'a');
do $$ begin
  if nexus_private.birthday_greetings('2027-03-14 06:30+00') <> 0 then raise exception 'Voor acht uur ging er al iets weg'; end if;
  if nexus_private.birthday_greetings('2027-03-14 09:00+00') <> 3 then raise exception 'Niet elk bericht ging weg: %', (select jsonb_agg(m) from public.system_messages m); end if;
  if nexus_private.birthday_greetings('2027-03-14 12:00+00') <> 0 then raise exception 'Een tweede keer ging er opnieuw iets weg'; end if;
  if not exists (select 1 from public.push_schedule where ref = 'system:birthday:2027' and extra ->> 'kind' = 'system') then raise exception 'Geen push naar de gsm van de jarige'; end if;
  if (select count(*) from public.system_messages where user_id = '00000000-0000-0000-0000-000000000b72') <> 1 then raise exception 'De vriend kreeg niet alleen het gedeelde seintje'; end if;
  -- 29 February counts on 28 February in other years.
  update public.birthdays set month_day = '02-29' where user_id = '00000000-0000-0000-0000-000000000b71';
  if nexus_private.birthday_greetings('2029-02-28 10:00+00') <> 2 then raise exception '29 februari telde niet op 28 februari'; end if;
end $$;

-- 5. You read and delete only your own messages.
set role authenticated;
set test.uid = '00000000-0000-0000-0000-000000000b71';
do $$ begin
  if (select count(*) from public.system_messages) <> 2 then raise exception 'De jarige ziet niet alleen de eigen berichten'; end if;
  if (select body from public.system_messages where ref = 'birthday:2027') not like 'Gelukkige verjaardag, Jarige!%' then raise exception 'De tekst klopt niet'; end if;
  perform public.system_messages_read(null);
  if exists (select 1 from public.system_messages where read_at is null) then raise exception 'Gelezen zetten lukte niet'; end if;
end $$;
set test.uid = '00000000-0000-0000-0000-000000000b72';
delete from public.system_messages where user_id = '00000000-0000-0000-0000-000000000b71';
reset role;
do $$ begin
  if (select count(*) from public.system_messages where user_id = '00000000-0000-0000-0000-000000000b71') <> 2 then raise exception 'Iemand anders wiste een bericht'; end if;
end $$;
