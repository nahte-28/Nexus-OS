-- Darts: your matches, legs and stats follow you to every device as one row in user_settings
-- (key 'darts'), with the same revision rule and row level security as the other apps. Safe to run again.
alter table public.user_settings drop constraint if exists user_settings_key_check;
alter table public.user_settings add constraint user_settings_key_check check (key in (
  'profiles', 'flows', 'grades', 'habits', 'flashcards', 'budget', 'finance', 'exams', 'journal', 'spaces',
  'captures', 'briefing', 'knowledge', 'projecthub', 'studylab', 'gaming', 'inbox', 'vault', 'darts'
)) not valid; -- older rows were checked before; a later key list may be wider
