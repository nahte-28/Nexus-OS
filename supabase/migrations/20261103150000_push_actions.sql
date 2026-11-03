-- NEXUS meldingsknoppen: a web-push notice on the phone (and the watch through Chrome) gets the
-- buttons Klaar and Later. The pc puts a random token inside the encrypted notice and only its
-- SHA-256 here; tapping a button sends the token back through /api/push-action. Only the phone
-- that could open the notice knows the token, so nobody else can tick off your deadlines.
-- Running this file again is fine.

alter table public.push_schedule add column if not exists token_hash text;

do $$
begin
  alter table public.push_schedule add constraint push_schedule_token_hash check (token_hash is null or token_hash ~ '^[0-9a-f]{64}$');
exception when duplicate_object then null;
end $$;

-- Klaar: marks the deadline done (as if you ticked it off on the pc) and drops its pending notices.
-- Later: the same encrypted notice comes again in an hour, at most five times.
create or replace function public.push_action(p_ref text, p_token text, p_action text) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_hash text;
  v_user uuid;
  v_id uuid;
  v_ms bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint;
  v_base text;
begin
  if p_action is null or p_action not in ('done', 'later') or p_ref is null or length(p_ref) > 300
     or p_token is null or length(p_token) < 20 or length(p_token) > 100 then
    return 'ongeldig';
  end if;
  v_hash := encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
  v_user := (select s.user_id from public.push_schedule s where s.ref = p_ref and s.token_hash = v_hash and s.sent_at is not null limit 1);
  if v_user is null then
    return 'onbekend';
  end if;

  if p_action = 'done' then
    if p_ref !~ '^deadline:[0-9a-f-]{36}@' then
      return 'ongeldig';
    end if;
    v_id := substring(p_ref from 10 for 36)::uuid;
    update public.life_items
       set data = data || jsonb_build_object('doneAt', v_ms), updated_at = v_ms
     where id = v_id and user_id = v_user and kind = 'deadline' and deleted_at is null
       and (data->>'doneAt') is null;
    delete from public.push_schedule
     where user_id = v_user and sent_at is null and ref like 'deadline:' || v_id::text || '@%';
    return 'klaar';
  end if;

  v_base := split_part(p_ref, '~later', 1);
  if (select count(*) from public.push_schedule where user_id = v_user and ref like v_base || '~later%') >= 5 then
    return 'te vaak';
  end if;
  insert into public.push_schedule (user_id, sender_device_id, recipient_device_id, ref, at, ephemeral_key, iv, ciphertext, token_hash)
  select s.user_id, s.sender_device_id, s.recipient_device_id, v_base || '~later' || v_ms, now() + interval '1 hour', s.ephemeral_key, s.iv, s.ciphertext, s.token_hash
    from public.push_schedule s
   where s.ref = p_ref and s.token_hash = v_hash and s.sent_at is not null
   limit 1
  on conflict (recipient_device_id, ref) do nothing;
  return 'later';
end;
$$;

revoke all on function public.push_action(text, text, text) from public;
grant execute on function public.push_action(text, text, text) to anon, authenticated;
