-- NEXUS Life: appointments next to deadlines and projects, in the same table.
alter table public.life_items drop constraint if exists life_items_kind_check;
alter table public.life_items add constraint life_items_kind_check check (kind in ('deadline', 'project', 'appointment'));
