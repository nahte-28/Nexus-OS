-- NEXUS Privéberichten: one-to-one messages between friends, end-to-end encrypted. Run after
-- 20261019120000_connect.sql and 20261113150000_friends.sql. The sender's NEXUS seals every message
-- once per device (the NEXUS Connect key of each web and desktop device of both people); this
-- table only ever holds those sealed envelopes, never the text. Safe to run again.

create table if not exists public.dm_messages (
  id uuid primary key default gen_random_uuid(),
  sender uuid not null default auth.uid() references auth.users (id) on delete cascade,
  recipient uuid not null references auth.users (id) on delete cascade,
  -- { "<device id>": { "ephemeralKey", "iv", "ciphertext" } }
  envelopes jsonb not null check (jsonb_typeof(envelopes) = 'object' and pg_column_size(envelopes) <= 65536),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  check (sender <> recipient)
);
create index if not exists dm_messages_pair on public.dm_messages (least(sender, recipient), greatest(sender, recipient), created_at desc);
create index if not exists dm_messages_recipient on public.dm_messages (recipient, read_at);

alter table public.dm_messages enable row level security;
revoke update on public.dm_messages from anon, authenticated;

drop policy if exists "You read your own conversations" on public.dm_messages;
create policy "You read your own conversations" on public.dm_messages
  for select to authenticated using ((select auth.uid()) in (sender, recipient));
drop policy if exists "You write to your friends" on public.dm_messages;
create policy "You write to your friends" on public.dm_messages
  for insert to authenticated with check (sender = (select auth.uid()) and public.are_friends(sender, recipient));
drop policy if exists "Either side removes a message" on public.dm_messages;
create policy "Either side removes a message" on public.dm_messages
  for delete to authenticated using ((select auth.uid()) in (sender, recipient));

-- The server sets the time; 30 messages a minute per sender; a conversation keeps its last 1000.
create or replace function public.dm_messages_limit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.created_at := now();
  new.read_at := null;
  if (select count(*) from public.dm_messages where sender = new.sender and created_at > now() - interval '1 minute') >= 30 then
    raise exception 'too many messages';
  end if;
  delete from public.dm_messages where id in (
    select id from public.dm_messages
    where least(sender, recipient) = least(new.sender, new.recipient) and greatest(sender, recipient) = greatest(new.sender, new.recipient)
    order by created_at desc offset 999
  );
  return new;
end $$;
drop trigger if exists dm_messages_limit on public.dm_messages;
create trigger dm_messages_limit before insert on public.dm_messages
  for each row execute function public.dm_messages_limit();

-- The Connect keys to seal a message for: your own devices and your friend's (web and desktop,
-- not revoked, the 10 most recently seen of each). Nothing for someone who is not your friend.
create or replace function public.dm_device_keys(p_friend uuid)
returns table (user_id uuid, device_id uuid, public_key text) language sql stable security definer set search_path = public as $$
  select d.user_id, d.id, d.public_key from (
    select d.*, row_number() over (partition by d.user_id order by d.last_seen_at desc) as n
    from public.devices d
    where d.user_id in (auth.uid(), p_friend) and d.revoked_at is null and d.platform in ('web', 'desktop')
  ) d
  where d.n <= 10 and public.are_friends(auth.uid(), p_friend);
$$;

-- Marks what your friend sent you as read, up to now.
create or replace function public.mark_dm_read(p_friend uuid)
returns void language sql security definer set search_path = public as $$
  update public.dm_messages set read_at = now() where recipient = auth.uid() and sender = p_friend and read_at is null;
$$;

do $$
declare fn text;
begin
  foreach fn in array array['dm_device_keys(uuid)', 'mark_dm_read(uuid)'] loop
    execute format('revoke all on function public.%s from public', fn);
    execute format('grant execute on function public.%s to authenticated', fn);
  end loop;
end $$;

-- Live in Vrienden › Berichten (row level security applies).
do $$
begin
  alter publication supabase_realtime add table public.dm_messages;
exception when duplicate_object then null;
end $$;
