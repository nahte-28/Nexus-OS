-- NEXUS: de database veiliger en sneller, naar de adviezen van Supabase (Database Advisors).
-- Verandert niets aan wat je ziet of kan; mag opnieuw lopen.
--
-- 1. Wie niet ingelogd is (de rol anon), kan geen SECURITY DEFINER-functies meer oproepen, behalve
--    de drie die met een eenmalige code werken (antwoorden en acties vanuit een pushmelding) en de
--    hulpfuncties die rijbeveiliging gebruikt. Ingelogd verandert er niets.
-- 2. Elke functie krijgt een vast search_path, zodat ze niet per ongeluk een andere tabel of
--    functie met dezelfde naam gebruikt.
-- 3. Rijbeveiliging die auth.uid() per rij opnieuw uitrekende, doet dat nu één keer per vraag.
-- 4. Elke foreign key krijgt een index: verwijderen en opzoeken per gebruiker of team gaat sneller.

-- 1. Uitvoerrechten
do $$
declare
  f record;
  -- Met een eenmalige code, zonder login (api/push-reply.ts, api/push-action.ts).
  token_based text[] := array['message_reply_keys', 'message_reply', 'push_action', 'agenda_feed'];
  -- Gebruikt in rijbeveiliging: anon moet ze kunnen oproepen om gewoon niets te zien.
  policy_helpers text[] := array['are_friends', 'is_study_group_member', 'study_group_can_edit', 'study_group_can_manage',
    'study_group_role', 'is_nexus_admin', 'note_share_right'];
  was_auth boolean;
begin
  for f in
    select p.oid, p.oid::regprocedure as sig, p.proname
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  loop
    continue when f.proname = any (token_based) or f.proname = any (policy_helpers);
    was_auth := has_function_privilege('authenticated', f.oid, 'execute');
    execute format('revoke execute on function %s from public, anon', f.sig);
    -- Wie het al kon, houdt het: ingelogde gebruikers en de server.
    if was_auth then
      execute format('grant execute on function %s to authenticated', f.sig);
    end if;
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;

-- 2. Vaste search_path voor de eigen functies van NEXUS (niet die van extensies).
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'nexus_private') and p.prokind = 'f'
      and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  loop
    execute format('alter function %s set search_path = public, nexus_private, extensions', f.sig);
  end loop;
end $$;

-- 3. auth.uid() één keer per vraag in plaats van per rij.
do $$ begin
  if to_regclass('public.card_duels') is not null then
    drop policy if exists "card_duels read" on public.card_duels;
    create policy "card_duels read" on public.card_duels for select to authenticated
      using ((select auth.uid()) = host or (select auth.uid()) = guest);
  end if;
  if to_regclass('public.darts_online') is not null then
    drop policy if exists "darts_online read" on public.darts_online;
    create policy "darts_online read" on public.darts_online for select to authenticated
      using ((select auth.uid()) = host or (select auth.uid()) = guest);
  end if;
  if to_regclass('public.appointment_invites') is not null then
    drop policy if exists "appointment_invites read" on public.appointment_invites;
    create policy "appointment_invites read" on public.appointment_invites for select to authenticated
      using ((select auth.uid()) = host or (select auth.uid()) = guest);
  end if;
  if to_regclass('public.free_busy') is not null then
    drop policy if exists "free_busy own" on public.free_busy;
    create policy "free_busy own" on public.free_busy for select to authenticated using (user_id = (select auth.uid()));
  end if;
end $$;

-- 4. Een index op elke foreign key die er nog geen heeft (de kolommen vooraan in een index).
do $$
declare
  fk record;
  cols text;
  name text;
begin
  for fk in
    select c.conrelid, c.conkey, cl.relname, n.nspname
    from pg_constraint c join pg_class cl on cl.oid = c.conrelid join pg_namespace n on n.oid = cl.relnamespace
    where c.contype = 'f' and n.nspname in ('public', 'nexus_private')
      and not exists (
        select 1 from pg_index i where i.indrelid = c.conrelid
          and (i.indkey::int2[])[0:array_length(c.conkey, 1) - 1] @> c.conkey
          and (i.indkey::int2[])[0:array_length(c.conkey, 1) - 1] <@ c.conkey)
  loop
    select string_agg(quote_ident(a.attname), ', ' order by k.ord), string_agg(a.attname, '_' order by k.ord)
      into cols, name
      from unnest(fk.conkey) with ordinality k(attnum, ord)
      join pg_attribute a on a.attrelid = fk.conrelid and a.attnum = k.attnum;
    name := left(fk.relname || '_' || name || '_fk', 63);
    execute format('create index if not exists %I on %I.%I (%s)', name, fk.nspname, fk.relname, cols);
  end loop;
end $$;

-- Voor Database-check: deze stap is gelopen.
create or replace function public.nexus_hardening_version()
returns int language sql immutable set search_path = public as $$ select 1 $$;
revoke execute on function public.nexus_hardening_version() from public, anon;
grant execute on function public.nexus_hardening_version() to authenticated;
