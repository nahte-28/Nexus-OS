-- NEXUS Universal Inbox 2.0. Per item, on which device it arrived and where it was read
-- (delivery: {"<device name>": {"seenAt": ms, "readAt": ms}}), and the rules per source in
-- user_settings under the key 'inbox', so every device files messages the same way.
-- Run after 20261029190000_inbox.sql.
alter table public.inbox_items add column if not exists delivery jsonb not null default '{}'::jsonb;
alter table public.inbox_items drop constraint if exists inbox_items_delivery_check;
alter table public.inbox_items add constraint inbox_items_delivery_check
  check (jsonb_typeof(delivery) = 'object' and pg_column_size(delivery) <= 2000);

-- Both records together: per device the first arrival and the first read.
create or replace function public.inbox_merge_delivery(a jsonb, b jsonb) returns jsonb
language sql immutable set search_path = public as $$
  select coalesce(jsonb_object_agg(k, jsonb_strip_nulls(jsonb_build_object(
    'seenAt', least((a -> k ->> 'seenAt')::bigint, (b -> k ->> 'seenAt')::bigint),
    'readAt', least((a -> k ->> 'readAt')::bigint, (b -> k ->> 'readAt')::bigint)))), '{}'::jsonb)
  from (
    select jsonb_object_keys(coalesce(a, '{}'::jsonb)) as k
    union
    select jsonb_object_keys(coalesce(b, '{}'::jsonb))
  ) keys;
$$;

-- As before, an older change never overwrites a newer one. Delivery is not a change of the item:
-- it always adds up, also from a device whose copy is older.
create or replace function public.inbox_items_before_write() returns trigger
language plpgsql set search_path = public as $$
declare
  merged jsonb;
begin
  if tg_op = 'UPDATE' then
    merged := public.inbox_merge_delivery(old.delivery, new.delivery);
    if new.updated_at < old.updated_at then
      if merged = old.delivery then
        return null;
      end if;
      new := old;
    end if;
    new.delivery := merged;
  end if;
  new.synced_at := now();
  return new;
end;
$$;

alter table public.user_settings drop constraint if exists user_settings_key_check;
alter table public.user_settings add constraint user_settings_key_check check (key in (
  'profiles', 'flows', 'grades', 'habits', 'flashcards', 'budget', 'finance', 'exams', 'journal', 'spaces',
  'captures', 'briefing', 'knowledge', 'projecthub', 'studylab', 'gaming', 'inbox'
)) not valid; -- older rows were checked before; a later key list may be wider
