-- NEXUS Database-check: tells the Account app which parts of the database exist, so NEXUS can
-- show which SQL steps are still missing. It returns only names and constraint definitions,
-- never anyone's data.
create or replace function public.nexus_schema_status()
returns jsonb language sql stable security definer set search_path = public, pg_catalog as $$
  select jsonb_build_object(
    'version', 1,
    'tables', coalesce((select jsonb_agg(c.relname order by c.relname) from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'), '[]'::jsonb),
    'functions', coalesce((select jsonb_agg(distinct p.proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'), '[]'::jsonb),
    'constraints', coalesce((select jsonb_object_agg(con.conname, pg_get_constraintdef(con.oid)) from pg_constraint con
      join pg_class c on c.oid = con.conrelid join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and con.contype = 'c' and con.conname in ('user_settings_key_check', 'life_items_kind_check')), '{}'::jsonb),
    'buckets', coalesce((select jsonb_agg(id) from storage.buckets), '[]'::jsonb)
  )
$$;
revoke all on function public.nexus_schema_status() from public;
grant execute on function public.nexus_schema_status() to authenticated;
