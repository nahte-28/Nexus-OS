-- NEXUS database veiliger en sneller (20261124090000_hardening.sql).
\set ON_ERROR_STOP 1
reset role;
do $$
declare n int;
begin
  -- 1. Niet ingelogd: geen gewone RPC's meer, wel de drie met een eenmalige code en de hulpfuncties van rijbeveiliging.
  if has_function_privilege('anon', 'public.accept_friend(uuid)', 'execute') then raise exception 'anon kan accept_friend nog'; end if;
  if has_function_privilege('anon', 'public.admin_overview()', 'execute') then raise exception 'anon kan admin_overview nog'; end if;
  if not has_function_privilege('authenticated', 'public.accept_friend(uuid)', 'execute') then raise exception 'ingelogd kan accept_friend niet meer'; end if;
  if not has_function_privilege('anon', 'public.push_action(text, text, text)', 'execute') then raise exception 'push_action zonder login werkt niet meer'; end if;
  if not has_function_privilege('anon', 'public.message_reply(text, text, jsonb)', 'execute') then raise exception 'antwoorden vanuit een melding werkt niet meer'; end if;
  if not has_function_privilege('anon', 'public.is_study_group_member(uuid)', 'execute') then raise exception 'hulpfunctie van rijbeveiliging is weg voor anon'; end if;
  select count(*) into n from pg_proc p join pg_namespace s on s.oid = p.pronamespace
    where s.nspname = 'public' and p.prosecdef and has_function_privilege('anon', p.oid, 'execute')
      and p.proname <> all (array['message_reply_keys', 'message_reply', 'push_action', 'are_friends', 'is_study_group_member',
        'study_group_can_edit', 'study_group_can_manage', 'study_group_role', 'is_nexus_admin', 'note_share_right']);
  if n > 0 then raise exception '% SECURITY DEFINER-functies nog open voor anon', n; end if;

  -- 2. Geen eigen functie zonder vast search_path.
  select count(*) into n from pg_proc p join pg_namespace s on s.oid = p.pronamespace
    where s.nspname in ('public', 'nexus_private') and p.prokind = 'f'
      and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e');
  if n > 0 then raise exception '% functies zonder vast search_path', n; end if;

  -- 3. auth.uid() in een subquery.
  select count(*) into n from pg_policies
    where (tablename, policyname) in (('card_duels', 'card_duels read'), ('darts_online', 'darts_online read'),
      ('appointment_invites', 'appointment_invites read'), ('free_busy', 'free_busy own'))
      and qual ~ 'auth\.uid\(\)' and qual !~* 'select auth\.uid\(\)';
  if n > 0 then raise exception '% beleidsregels rekenen auth.uid() nog per rij uit', n; end if;

  -- 4. Elke foreign key heeft een index.
  select count(*) into n from pg_constraint c join pg_namespace s on s.oid = c.connamespace
    where c.contype = 'f' and s.nspname in ('public', 'nexus_private')
      and not exists (select 1 from pg_index i where i.indrelid = c.conrelid
        and (i.indkey::int2[])[0:array_length(c.conkey, 1) - 1] @> c.conkey
        and (i.indkey::int2[])[0:array_length(c.conkey, 1) - 1] <@ c.conkey);
  if n > 0 then raise exception '% foreign keys zonder index', n; end if;
end $$;

-- De markering voor Database-check. (Alle andere tests lopen al na deze stap, met het vaste search_path.)
set role authenticated;
set test.uid = '00000000-0000-0000-0000-0000000000a1';
select public.nexus_hardening_version();
reset role;
