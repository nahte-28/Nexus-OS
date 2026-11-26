-- Documenten zonder eigen SQL (20261126110000_settings_docs.sql).
\set ON_ERROR_STOP 1
reset role;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000d0c1', 'doc-a@example.com'),
  ('00000000-0000-0000-0000-00000000d0c2', 'doc-b@example.com')
on conflict do nothing;

set role authenticated;
set test.uid = '00000000-0000-0000-0000-00000000d0c1';

do $$
declare n int;
begin
  -- 1. Een nieuw document met doc.<naam> mag, een vaste sleutel nog steeds.
  insert into public.user_settings (key, value, revision) values ('doc.leesplan', '{"a":1}', 1);
  insert into public.user_settings (key, value, revision) values ('goals', '{}', 1);

  -- 2. Verzonnen of foute sleutels niet.
  begin
    insert into public.user_settings (key, value, revision) values ('iets', '{}', 1);
    raise exception 'een verzonnen sleutel werd aanvaard';
  exception when check_violation then null;
  end;
  begin
    insert into public.user_settings (key, value, revision) values ('doc.Hoofdletters', '{}', 1);
    raise exception 'doc. met hoofdletters werd aanvaard';
  exception when check_violation then null;
  end;
  begin
    insert into public.user_settings (key, value, revision) values ('doc.', '{}', 1);
    raise exception 'een lege doc.-naam werd aanvaard';
  exception when check_violation then null;
  end;

  -- 3. Hoogstens 64 rijen per account.
  for i in 3..64 loop
    insert into public.user_settings (key, value, revision) values ('doc.extra-' || i, '{}', 1);
  end loop;
  select count(*) into n from public.user_settings;
  if n <> 64 then raise exception 'verwacht 64 rijen, kreeg %', n; end if;
  begin
    insert into public.user_settings (key, value, revision) values ('doc.een-te-veel', '{}', 1);
    raise exception 'een 65ste rij werd aanvaard';
  exception when check_violation then null;
  end;

  -- 4. Ook aan het plafond blijft bijwerken werken, ook met een upsert zoals NEXUS bewaart.
  update public.user_settings set value = '{"a":2}', revision = 2 where key = 'doc.leesplan';
  insert into public.user_settings (key, value, revision) values ('doc.leesplan', '{"a":3}', 3)
    on conflict (user_id, key) do update set value = excluded.value, revision = excluded.revision;
  if (select value->>'a' from public.user_settings where key = 'doc.leesplan') <> '3' then
    raise exception 'bijwerken aan het plafond lukte niet';
  end if;
end $$;

-- 5. Een ander account ziet die documenten niet en kan ze niet wijzigen.
set test.uid = '00000000-0000-0000-0000-00000000d0c2';
do $$
begin
  if exists (select 1 from public.user_settings where key = 'doc.leesplan') then
    raise exception 'B ziet het document van A';
  end if;
  update public.user_settings set value = '{"x":1}', revision = 99 where key = 'doc.leesplan';
  insert into public.user_settings (key, value, revision) values ('doc.leesplan', '{"b":1}', 1);
end $$;
set test.uid = '00000000-0000-0000-0000-00000000d0c1';
do $$
begin
  if (select value->>'a' from public.user_settings where key = 'doc.leesplan') <> '3' then
    raise exception 'B veranderde het document van A';
  end if;
end $$;

-- 6. De markering voor Database-check, alleen voor wie aangemeld is.
select public.nexus_settings_docs_version();
reset role;
do $$
begin
  if has_function_privilege('anon', 'public.nexus_settings_docs_version()', 'execute') then
    raise exception 'anon kan de markering aanroepen';
  end if;
end $$;
