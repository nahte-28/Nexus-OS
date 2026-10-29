-- NEXUS Spaces: workspaces inside a profile follow you to every device as one row in
-- user_settings (key 'spaces'), with the same revision rule and row level security as the
-- other apps: each user reads and writes only their own rows.
alter table public.user_settings drop constraint if exists user_settings_key_check;
alter table public.user_settings add constraint user_settings_key_check check (key in ('profiles', 'flows', 'grades', 'habits', 'flashcards', 'budget', 'finance', 'exams', 'journal', 'spaces'));
