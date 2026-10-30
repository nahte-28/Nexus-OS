-- The modules of the two new blueprints (8 Modules and Evolution 2.0) follow you to every device
-- as one row each in user_settings, with the same revision rule and row level security as the other
-- apps. Allowed at once, so this is the only SQL step for them: 'captures' (Snel vastleggen),
-- 'briefing' (Dagstart 2.0), 'knowledge' (Kennis), 'projecthub' (Project Hub), 'studylab' (Study Lab)
-- and 'gaming' (Gaming Companion).
alter table public.user_settings drop constraint if exists user_settings_key_check;
alter table public.user_settings add constraint user_settings_key_check check (key in (
  'profiles', 'flows', 'grades', 'habits', 'flashcards', 'budget', 'finance', 'exams', 'journal', 'spaces',
  'captures', 'briefing', 'knowledge', 'projecthub', 'studylab', 'gaming'
));
