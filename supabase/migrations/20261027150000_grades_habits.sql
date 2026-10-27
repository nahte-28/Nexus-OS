-- NEXUS OS: Cijfers and Gewoontes follow you to every device, each as one row in user_settings
-- (keys 'grades' and 'habits'), with the same revision rule as profiles and flows.
alter table public.user_settings drop constraint if exists user_settings_key_check;
alter table public.user_settings add constraint user_settings_key_check check (key in ('profiles', 'flows', 'grades', 'habits'));
