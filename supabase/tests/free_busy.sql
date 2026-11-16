-- NEXUS Samen vrij moment zoeken (20261116230000_free_busy.sql): only friends see your busy blocks,
-- turning sharing off forgets them, and nobody writes the table directly.
\set ON_ERROR_STOP 1
reset role;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000f91', 'fb-ethan@test'), ('00000000-0000-0000-0000-000000000f92', 'fb-remo@test'),
  ('00000000-0000-0000-0000-000000000f93', 'fb-vreemde@test');
insert into public.friend_profiles (user_id, display_name, code) values
  ('00000000-0000-0000-0000-000000000f91', 'Ethan', 'VRYBSYEA'), ('00000000-0000-0000-0000-000000000f92', 'Remo', 'VRYBSYRB');
insert into public.friendships (requester, addressee, status, accepted_at) values
  ('00000000-0000-0000-0000-000000000f91', '00000000-0000-0000-0000-000000000f92', 'accepted', now());

-- 1. Remo publishes his blocks; no direct writes.
set role authenticated;
set test.uid = '00000000-0000-0000-0000-000000000f92';
select public.free_busy_publish('[[1000, 2000], [3000, 4000]]'::jsonb, now() + interval '14 days');
do $$ begin
  begin
    insert into public.free_busy (user_id) values ('00000000-0000-0000-0000-000000000f93');
    raise exception 'Rechtstreeks schrijven lukte';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.free_busy_publish('{"a": 1}'::jsonb, now());
    raise exception 'Geen lijst aanvaard';
  exception when invalid_parameter_value then null;
  end;
  if (public.free_busy_mine() ->> 'shares')::boolean is not true then raise exception 'Delen staat niet standaard aan'; end if;
end $$;

-- 2. Ethan (a friend) sees the blocks, a stranger sees nothing.
set test.uid = '00000000-0000-0000-0000-000000000f91';
do $$ begin
  if jsonb_array_length(public.free_busy_of(array['00000000-0000-0000-0000-000000000f92'::uuid]) -> 0 -> 'blocks') <> 2 then raise exception 'Een vriend ziet de blokken niet'; end if;
  if (public.free_busy_of(array['00000000-0000-0000-0000-000000000f92'::uuid]) -> 0 ->> 'name') <> 'Remo' then raise exception 'De naam klopt niet'; end if;
  if (select count(*) from public.free_busy) <> 0 then raise exception 'Ethan leest de rij van Remo'; end if;
end $$;
set test.uid = '00000000-0000-0000-0000-000000000f93';
do $$ begin
  if jsonb_array_length(public.free_busy_of(array['00000000-0000-0000-0000-000000000f92'::uuid])) <> 0 then raise exception 'Een vreemde ziet de blokken'; end if;
end $$;

-- 3. Remo stops sharing: the blocks are gone and stay gone when his NEXUS publishes again.
set test.uid = '00000000-0000-0000-0000-000000000f92';
select public.free_busy_share(false);
select public.free_busy_publish('[[5000, 6000]]'::jsonb, now() + interval '14 days');
set test.uid = '00000000-0000-0000-0000-000000000f91';
do $$ begin
  if (public.free_busy_of(array['00000000-0000-0000-0000-000000000f92'::uuid]) -> 0 ->> 'shares')::boolean then raise exception 'Delen bleef aan'; end if;
  if jsonb_array_length(public.free_busy_of(array['00000000-0000-0000-0000-000000000f92'::uuid]) -> 0 -> 'blocks') <> 0 then raise exception 'De blokken bleven zichtbaar'; end if;
end $$;
reset role;
