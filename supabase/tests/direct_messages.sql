-- NEXUS Privéberichten (20261113180000_direct_messages.sql): only friends write to each other,
-- only the two of them read, keys come only for friends, and read marks only by the recipient.
\set ON_ERROR_STOP 1
reset role;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000e11', 'dm-a@test'), ('00000000-0000-0000-0000-000000000e12', 'dm-b@test'),
  ('00000000-0000-0000-0000-000000000e13', 'dm-c@test');
insert into public.devices (id, user_id, name, platform, public_key) values
  ('00000000-0000-0000-0000-00000000f011', '00000000-0000-0000-0000-000000000e11', 'A pc', 'web', repeat('A', 88)),
  ('00000000-0000-0000-0000-00000000f012', '00000000-0000-0000-0000-000000000e12', 'B pc', 'desktop', repeat('B', 88)),
  ('00000000-0000-0000-0000-00000000f013', '00000000-0000-0000-0000-000000000e12', 'B gsm', 'android', repeat('C', 88)),
  ('00000000-0000-0000-0000-00000000f014', '00000000-0000-0000-0000-000000000e13', 'C pc', 'web', repeat('D', 88));
insert into public.friendships (requester, addressee, status, accepted_at) values
  ('00000000-0000-0000-0000-000000000e11', '00000000-0000-0000-0000-000000000e12', 'accepted', now());

set role authenticated;
set test.uid = '00000000-0000-0000-0000-000000000e11';
do $$ begin
  if (select string_agg(device_id::text, ',' order by device_id) from public.dm_device_keys('00000000-0000-0000-0000-000000000e12'))
     <> '00000000-0000-0000-0000-00000000f011,00000000-0000-0000-0000-00000000f012' then
    raise exception 'De sleutels voor een vriend kloppen niet (geen gsm, wel beide pc''s)';
  end if;
  if exists (select 1 from public.dm_device_keys('00000000-0000-0000-0000-000000000e13')) then raise exception 'Sleutels van iemand die geen vriend is'; end if;
end $$;
insert into public.dm_messages (id, recipient, envelopes, read_at) values ('00000000-0000-0000-0000-00000000a011', '00000000-0000-0000-0000-000000000e12', '{"x": {"ciphertext": "..."}}', now());
do $$ begin
  insert into public.dm_messages (recipient, envelopes) values ('00000000-0000-0000-0000-000000000e13', '{}');
  raise exception 'Een bericht aan iemand die geen vriend is lukte';
exception when insufficient_privilege then null;
end $$;
do $$ begin
  if (select read_at from public.dm_messages) is not null then raise exception 'De schrijver zette het bericht zelf op gelezen'; end if;
  begin
    update public.dm_messages set envelopes = '{}';
    raise exception 'Een bericht kon gewijzigd worden';
  exception when insufficient_privilege then null;
  end;
end $$;

-- B reads and marks as read; C sees nothing; A marking does nothing for B's side.
set test.uid = '00000000-0000-0000-0000-000000000e13';
do $$ begin
  if exists (select 1 from public.dm_messages) then raise exception 'Iemand anders leest een privébericht'; end if;
end $$;
set test.uid = '00000000-0000-0000-0000-000000000e11';
select public.mark_dm_read('00000000-0000-0000-0000-000000000e12');
set test.uid = '00000000-0000-0000-0000-000000000e12';
do $$ begin
  if (select read_at from public.dm_messages) is not null then raise exception 'De schrijver markeerde het als gelezen'; end if;
  perform public.mark_dm_read('00000000-0000-0000-0000-000000000e11');
  if (select read_at from public.dm_messages) is null then raise exception 'Gelezen markeren lukte niet'; end if;
end $$;

-- After the friendship ends, no keys and no new messages; either side removes a message.
reset role;
delete from public.friendships;
set role authenticated;
set test.uid = '00000000-0000-0000-0000-000000000e11';
do $$ begin
  if exists (select 1 from public.dm_device_keys('00000000-0000-0000-0000-000000000e12')) then raise exception 'Sleutels na het einde van de vriendschap'; end if;
  begin
    insert into public.dm_messages (recipient, envelopes) values ('00000000-0000-0000-0000-000000000e12', '{}');
    raise exception 'Een bericht na het einde van de vriendschap lukte';
  exception when insufficient_privilege then null;
  end;
end $$;
set test.uid = '00000000-0000-0000-0000-000000000e12';
delete from public.dm_messages;
do $$ begin
  if exists (select 1 from public.dm_messages) then raise exception 'De ontvanger kon een bericht niet verwijderen'; end if;
end $$;
reset role;
