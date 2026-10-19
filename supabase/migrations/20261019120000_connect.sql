-- NEXUS OS v0.4: NEXUS Connect (Device Center and end-to-end encrypted notifications).
-- Each device holds its own key pair; the server only stores public keys and ciphertext it
-- cannot read. Delivered notifications are deleted by the recipient, the rest expires.

create table if not exists public.devices (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (length(name) between 1 and 80),
  platform text not null check (platform in ('web', 'android', 'desktop')),
  -- P-256 public key as an uncompressed point (65 bytes), base64.
  public_key text not null check (length(public_key) between 80 and 100),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz
);

create index if not exists devices_user on public.devices (user_id);

alter table public.devices enable row level security;

create policy "Users read their own devices" on public.devices
  for select to authenticated using ((select auth.uid()) = user_id);

create policy "Users register their own devices" on public.devices
  for insert to authenticated with check ((select auth.uid()) = user_id and revoked_at is null);

create policy "Users update their own devices" on public.devices
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- No delete policy: a device is revoked, so its history (name, dates) stays visible.

create or replace function public.devices_before_update() returns trigger
language plpgsql as $$
begin
  -- A device's identity is fixed and a revocation is final.
  new.id := old.id;
  new.user_id := old.user_id;
  new.public_key := old.public_key;
  new.created_at := old.created_at;
  if old.revoked_at is not null then
    new.revoked_at := old.revoked_at;
  end if;
  return new;
end;
$$;

drop trigger if exists devices_before_update on public.devices;
create trigger devices_before_update
  before update on public.devices
  for each row execute function public.devices_before_update();

create table if not exists public.connect_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  sender_device_id uuid not null references public.devices (id) on delete cascade,
  recipient_device_id uuid not null references public.devices (id) on delete cascade,
  -- ECIES envelope: ephemeral public key, AES-GCM nonce and ciphertext, all base64.
  ephemeral_key text not null,
  iv text not null,
  ciphertext text not null check (length(ciphertext) <= 16384),
  created_at timestamptz not null default now(),
  -- No permanent cloud archive: undelivered messages disappear after a day.
  expires_at timestamptz not null default now() + interval '1 day'
);

create index if not exists connect_messages_recipient on public.connect_messages (recipient_device_id, created_at);

alter table public.connect_messages enable row level security;

create or replace function public.is_active_device(device uuid) returns boolean
language sql stable security invoker as $$
  select exists (
    select 1 from public.devices d
    where d.id = device and d.user_id = (select auth.uid()) and d.revoked_at is null
  );
$$;

create policy "Devices read messages for themselves" on public.connect_messages
  for select to authenticated
  using ((select auth.uid()) = user_id and expires_at > now() and public.is_active_device(recipient_device_id));

create policy "Active devices send to active devices" on public.connect_messages
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and public.is_active_device(sender_device_id)
    and public.is_active_device(recipient_device_id)
  );

create policy "Users delete their own messages" on public.connect_messages
  for delete to authenticated using ((select auth.uid()) = user_id);

create or replace function public.connect_messages_cleanup() returns trigger
language plpgsql as $$
begin
  delete from public.connect_messages where user_id = new.user_id and expires_at < now();
  return null;
end;
$$;

drop trigger if exists connect_messages_cleanup on public.connect_messages;
create trigger connect_messages_cleanup
  after insert on public.connect_messages
  for each row execute function public.connect_messages_cleanup();

-- Open devices receive messages instantly.
alter publication supabase_realtime add table public.connect_messages;
