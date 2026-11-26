-- NEXUS: nieuwe modules hebben geen eigen SQL meer nodig om hun gegevens te syncen.
-- Naast de vaste lijst mag elke sleutel van de vorm doc.<naam> (kleine letters, cijfers,
-- streepjes, 2 tot 31 tekens). Een account heeft hoogstens 64 rijen, zodat niemand de database
-- kan vullen met zelfverzonnen sleutels. Opnieuw uitvoeren mag.

alter table public.user_settings drop constraint if exists user_settings_key_check;
alter table public.user_settings add constraint user_settings_key_check check (
  key in (
    'profiles', 'flows', 'grades', 'habits', 'flashcards', 'budget', 'finance', 'exams', 'journal', 'spaces',
    'captures', 'briefing', 'knowledge', 'projecthub', 'studylab', 'gaming', 'inbox', 'vault', 'darts', 'contacts',
    'goals'
  )
  or key ~ '^doc\.[a-z][a-z0-9-]{1,30}$'
) not valid; -- oudere rijen zijn al eerder gecontroleerd

create schema if not exists nexus_private;

-- Hoogstens 64 instellingen per account; alleen een echt nieuwe sleutel telt. Een upsert van een
-- bestaande sleutel (zo bewaart NEXUS) loopt ook langs deze trigger en moet altijd kunnen.
create or replace function nexus_private.user_settings_limit() returns trigger
language plpgsql set search_path = public, nexus_private as $$
begin
  if exists (select 1 from public.user_settings where user_id = new.user_id and key = new.key) then
    return new;
  end if;
  if (select count(*) from public.user_settings where user_id = new.user_id) >= 64 then
    raise exception 'Te veel instellingen voor dit account (hoogstens 64).' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
revoke execute on function nexus_private.user_settings_limit() from public, anon, authenticated;

drop trigger if exists user_settings_limit on public.user_settings;
create trigger user_settings_limit
  before insert on public.user_settings
  for each row execute function nexus_private.user_settings_limit();

-- Voor Database-check: deze stap is gelopen.
create or replace function public.nexus_settings_docs_version()
returns int language sql immutable set search_path = public as $$ select 1 $$;
revoke execute on function public.nexus_settings_docs_version() from public, anon;
grant execute on function public.nexus_settings_docs_version() to authenticated;
