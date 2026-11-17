-- NEXUS Leerkaarten-duel: you challenge a friend with one of your decks as multiple choice; you both
-- answer the same questions and the database counts who got the most right
-- (apps/web/src/flashcards/duel.ts). Run after 20261113150000_friends.sql and
-- 20261113240000_admin.sql. Safe to run again.
--   card_duels         the duel and its questions; read by both players (live via Realtime)
--   card_duel_results  the right answers and what each one picked; never read directly, so
--                      nobody sees the answers or the other one's picks before playing
-- Both are written only by the functions below.

create table if not exists public.card_duels (
  id uuid primary key default gen_random_uuid(),
  host uuid not null references auth.users (id) on delete cascade,
  guest uuid not null references auth.users (id) on delete cascade,
  host_name text not null check (char_length(host_name) between 1 and 40),
  guest_name text not null check (char_length(guest_name) between 1 and 40),
  deck_name text not null default '' check (char_length(deck_name) <= 80),
  questions jsonb not null check (jsonb_typeof(questions) = 'array' and jsonb_array_length(questions) between 1 and 10),
  host_played boolean not null default false,
  guest_played boolean not null default false,
  status text not null default 'open' check (status in ('open', 'done', 'declined')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (host <> guest)
);
create index if not exists card_duels_host on public.card_duels (host, created_at);
create index if not exists card_duels_guest on public.card_duels (guest, created_at);

create table if not exists public.card_duel_results (
  duel_id uuid primary key references public.card_duels (id) on delete cascade,
  answers int[] not null,
  host_picks int[],
  host_score int,
  host_ms int,
  guest_picks int[],
  guest_score int,
  guest_ms int
);

alter table public.card_duels enable row level security;
alter table public.card_duel_results enable row level security;
revoke insert, update, delete on public.card_duels from anon, authenticated;
revoke insert, update, delete on public.card_duel_results from anon, authenticated;
drop policy if exists "card_duels read" on public.card_duels;
create policy "card_duels read" on public.card_duels for select to authenticated using (auth.uid() in (host, guest));

-- Challenges friend [p_friend] with [p_questions] ([{front, options: [4 texts]}], at most 10) whose
-- right options are [p_answers]. At most 20 open duels of yours.
create or replace function public.card_duel_create(p_friend uuid, p_deck text, p_questions jsonb, p_answers int[])
returns uuid language plpgsql security definer set search_path = public as $$
declare
  result uuid;
begin
  if auth.uid() is null then raise exception 'Niet aangemeld' using errcode = '42501'; end if;
  if not exists (
    select 1 from public.friendships f
    where f.status = 'accepted' and ((f.requester = auth.uid() and f.addressee = p_friend) or (f.addressee = auth.uid() and f.requester = p_friend))
  ) then
    raise exception 'Je kunt alleen een vriend uitdagen' using errcode = '42501';
  end if;
  if jsonb_typeof(p_questions) is distinct from 'array' or jsonb_array_length(p_questions) not between 1 and 10
    or coalesce(cardinality(p_answers), 0) <> jsonb_array_length(p_questions)
    or exists (select 1 from unnest(p_answers) a where a is null or a not between 0 and 3)
    or exists (
      select 1 from jsonb_array_elements(p_questions) q
      where jsonb_typeof(q -> 'front') is distinct from 'string' or char_length(q ->> 'front') > 300
        or jsonb_typeof(q -> 'options') is distinct from 'array' or jsonb_array_length(q -> 'options') <> 4
        or exists (select 1 from jsonb_array_elements(q -> 'options') o where jsonb_typeof(o) <> 'string' or char_length(o #>> '{}') > 300)
    ) then
    raise exception 'Een duel heeft 1 tot 10 vragen met elk 4 antwoorden' using errcode = '22023';
  end if;
  if (select count(*) from public.card_duels where host = auth.uid() and status = 'open') >= 20 then
    raise exception 'Je hebt al 20 open duels' using errcode = '54000';
  end if;
  insert into public.card_duels (host, guest, host_name, guest_name, deck_name, questions)
  values (auth.uid(), p_friend, left(public.nexus_display_name(auth.uid()), 40), left(public.nexus_display_name(p_friend), 40), left(coalesce(p_deck, ''), 80), p_questions)
  returning id into result;
  insert into public.card_duel_results (duel_id, answers) values (result, p_answers);
  return result;
end $$;

-- Your answers to duel [p_id] (an option per question, -1 for none) in [p_ms] milliseconds; once.
-- Returns how many were right.
create or replace function public.card_duel_play(p_id uuid, p_picks int[], p_ms int)
returns int language plpgsql security definer set search_path = public as $$
declare
  me int;
  right_count int;
begin
  me := (select case when host = auth.uid() and not host_played then 0 when guest = auth.uid() and not guest_played then 1 end
    from public.card_duels where id = p_id and status = 'open');
  if me is null then raise exception 'Dit duel is er niet (meer) of je speelde het al' using errcode = '42501'; end if;
  if coalesce(cardinality(p_picks), 0) <> (select cardinality(answers) from public.card_duel_results where duel_id = p_id) then
    raise exception 'Beantwoord elke vraag' using errcode = '22023';
  end if;
  right_count := (select count(*) from public.card_duel_results r, generate_subscripts(r.answers, 1) i where r.duel_id = p_id and p_picks[i] = r.answers[i]);
  if me = 0 then
    update public.card_duel_results set host_picks = p_picks, host_score = right_count, host_ms = greatest(0, least(coalesce(p_ms, 0), 3600000)) where duel_id = p_id;
    update public.card_duels set host_played = true, status = case when guest_played then 'done' else status end, updated_at = now() where id = p_id;
  else
    update public.card_duel_results set guest_picks = p_picks, guest_score = right_count, guest_ms = greatest(0, least(coalesce(p_ms, 0), 3600000)) where duel_id = p_id;
    update public.card_duels set guest_played = true, status = case when host_played then 'done' else status end, updated_at = now() where id = p_id;
  end if;
  return right_count;
end $$;

-- The friend you challenged turns it down, before playing.
create or replace function public.card_duel_decline(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.card_duels set status = 'declined', updated_at = now()
  where id = p_id and guest = auth.uid() and status = 'open' and not guest_played;
  if not found then raise exception 'Dit duel is er niet (meer)' using errcode = '42501'; end if;
end $$;

-- Your duels of the last 60 days, newest first. The right answers and the other one's result only
-- after you played.
create or replace function public.card_duels_list()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', d.id,
    'side', d.side,
    'otherName', case when d.side = 0 then d.guest_name else d.host_name end,
    'deckName', d.deck_name,
    'questions', d.questions,
    'status', d.status,
    'myPicks', case when d.side = 0 then to_jsonb(r.host_picks) else to_jsonb(r.guest_picks) end,
    'myScore', case when d.side = 0 then r.host_score else r.guest_score end,
    'myMs', case when d.side = 0 then r.host_ms else r.guest_ms end,
    'answers', case when d.mine_played then to_jsonb(r.answers) end,
    'theirPlayed', case when d.side = 0 then d.guest_played else d.host_played end,
    'theirScore', case when d.mine_played then (case when d.side = 0 then r.guest_score else r.host_score end) end,
    'theirMs', case when d.mine_played then (case when d.side = 0 then r.guest_ms else r.host_ms end) end,
    'createdAt', d.created_at,
    'updatedAt', d.updated_at
  ) order by d.created_at desc), '[]'::jsonb)
  from (
    select x.*, case when x.host = auth.uid() then 0 else 1 end as side,
      case when x.host = auth.uid() then x.host_played else x.guest_played end as mine_played
    from public.card_duels x
    where auth.uid() in (x.host, x.guest) and x.created_at > now() - interval '60 days'
    order by x.created_at desc limit 100
  ) d
  join public.card_duel_results r on r.duel_id = d.id;
$$;

do $$
declare fn text;
begin
  foreach fn in array array[
    'card_duel_create(uuid, text, jsonb, int[])',
    'card_duel_play(uuid, int[], int)',
    'card_duel_decline(uuid)',
    'card_duels_list()'
  ] loop
    execute format('revoke all on function public.%s from public', fn);
    execute format('grant execute on function public.%s to authenticated', fn);
  end loop;
end $$;

-- Live for both players (row level security applies).
do $$
begin
  alter publication supabase_realtime add table public.card_duels;
exception when duplicate_object then null;
end $$;
