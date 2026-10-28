-- NEXUS OS: Financiën (transactions, budgets, savings goals, subscriptions) follows you to every
-- device as one row in user_settings (key 'finance'), with the same revision rule and the same
-- row level security as the other apps: each user reads and writes only their own row.
-- 'budget' stays allowed: rows of the earlier Budget app are read once and taken over by Financiën.
alter table public.user_settings drop constraint if exists user_settings_key_check;
alter table public.user_settings add constraint user_settings_key_check check (key in ('profiles', 'flows', 'grades', 'habits', 'flashcards', 'budget', 'finance'));
