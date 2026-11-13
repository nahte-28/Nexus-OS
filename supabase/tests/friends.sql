-- NEXUS Vrienden (20261113150000_friends.sql): adding with a code sends a request, only the other
-- person accepts, nobody reads someone else's code, and either friend ends the friendship.
\set ON_ERROR_STOP 1
reset role;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000d01', 'vriend-a@test'), ('00000000-0000-0000-0000-000000000d02', 'vriend-b@test'),
  ('00000000-0000-0000-0000-000000000d03', 'vriend-c@test');

set role authenticated;
set test.uid = '00000000-0000-0000-0000-000000000d01';
select code as code_a from public.set_friend_profile('Ethan') \gset
set test.uid = '00000000-0000-0000-0000-000000000d02';
select code as code_b from public.set_friend_profile('Remo') \gset
set test.uid = '00000000-0000-0000-0000-000000000d03';
select code as code_c from public.set_friend_profile('Zoë') \gset
select set_config('test.code_b', :'code_b', false) is not null as ok \gset

-- 1. A asks B; B sees the request, A cannot accept it for B, nobody reads another's code.
set test.uid = '00000000-0000-0000-0000-000000000d01';
do $$ declare r record; begin
  select * into r from public.request_friend(lower(substr(current_setting('test.code_b'), 1, 4)) || '-' || substr(current_setting('test.code_b'), 5));
  if r.status <> 'pending' or r.display_name <> 'Remo' then raise exception 'Een vriendschapsverzoek lukte niet: %', r; end if;
  if (select count(*) from public.friend_profiles) <> 1 then raise exception 'Iemand leest de code van een ander'; end if;
  if public.are_friends('00000000-0000-0000-0000-000000000d01', '00000000-0000-0000-0000-000000000d02') then raise exception 'Vrienden voor het aanvaarden'; end if;
  begin
    perform public.accept_friend('00000000-0000-0000-0000-000000000d02');
    raise exception 'Wie vroeg, kon zelf aanvaarden';
  exception when raise_exception then
    if sqlerrm <> 'no friend request' then raise; end if;
  end;
  begin
    insert into public.friendships (requester, addressee, status) values ('00000000-0000-0000-0000-000000000d03', '00000000-0000-0000-0000-000000000d01', 'accepted');
    raise exception 'Iemand maakte zelf een vriendschap aan';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.friend_profiles set code = 'AAAAAAAA';
    if (select code from public.friend_profiles) = 'AAAAAAAA' then raise exception 'Iemand koos zelf een code'; end if;
  exception when insufficient_privilege then null;
  end;
  if (select kind from public.list_friends()) <> 'outgoing' then raise exception 'A ziet zijn verzoek niet'; end if;
end $$;

-- 2. B accepts; both see each other as friends with their names.
set test.uid = '00000000-0000-0000-0000-000000000d02';
do $$ begin
  if (select kind from public.list_friends()) <> 'incoming' then raise exception 'B ziet het verzoek niet'; end if;
  perform public.accept_friend('00000000-0000-0000-0000-000000000d01');
  if (select display_name || ':' || kind from public.list_friends()) <> 'Ethan:friend' then raise exception 'B ziet A niet als vriend'; end if;
  if not public.are_friends('00000000-0000-0000-0000-000000000d02', '00000000-0000-0000-0000-000000000d01') then raise exception 'Geen vrienden na het aanvaarden'; end if;
end $$;

-- 3. C asks A and A asks C back: friends at once. C sees nothing of A and B.
set test.uid = '00000000-0000-0000-0000-000000000d03';
select status from public.request_friend(:'code_a') \gset
set test.uid = '00000000-0000-0000-0000-000000000d01';
select status as back from public.request_friend(:'code_c') \gset
select :'back' = 'accepted' as both_ways \gset
\if :both_ways
\else
  \echo 'Twee verzoeken over en weer gaven geen vriendschap'
  select 1/0;
\endif
set test.uid = '00000000-0000-0000-0000-000000000d03';
do $$ begin
  if (select count(*) from public.friendships) <> 1 then raise exception 'C ziet de vriendschappen van anderen'; end if;
  begin
    perform public.request_friend((select code from public.friend_profiles));
    raise exception 'Iemand werd zijn eigen vriend';
  exception when raise_exception then
    if sqlerrm <> 'own friend code' then raise; end if;
  end;
  if exists (select 1 from public.request_friend('ZZZZZZZZ')) then raise exception 'Een onbekende code gaf een vriend'; end if;
end $$;

-- 4. A new code stops the old one; either friend ends a friendship.
set test.uid = '00000000-0000-0000-0000-000000000d02';
select code as renewed from public.renew_friend_code() \gset
select :'renewed' <> :'code_b' as changed \gset
\if :changed
\else
  \echo 'De code veranderde niet'
  select 1/0;
\endif
delete from public.friendships;
do $$ begin
  if public.are_friends('00000000-0000-0000-0000-000000000d01', '00000000-0000-0000-0000-000000000d02') then raise exception 'De vriendschap bleef na het verwijderen'; end if;
end $$;
set test.uid = '00000000-0000-0000-0000-000000000d01';
do $$ begin
  if exists (select 1 from public.request_friend(current_setting('test.code_b'))) then raise exception 'De oude code werkte nog'; end if;
end $$;
reset role;
