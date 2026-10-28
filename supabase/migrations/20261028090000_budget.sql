-- NEXUS OS: Budget follows you to every device as one row in user_settings (key 'budget'),
-- with the same revision rule as the other apps.
alter table public.user_settings drop constraint if exists user_settings_key_check;
alter table public.user_settings add constraint user_settings_key_check check (key in ('profiles', 'flows', 'grades', 'habits', 'flashcards', 'budget'));
