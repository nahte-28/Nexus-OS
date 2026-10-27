-- NEXUS OS: Leerkaarten follow you to every device as one row in user_settings (key 'flashcards'),
-- with the same revision rule as profiles, flows, grades and habits.
alter table public.user_settings drop constraint if exists user_settings_key_check;
alter table public.user_settings add constraint user_settings_key_check check (key in ('profiles', 'flows', 'grades', 'habits', 'flashcards'));
