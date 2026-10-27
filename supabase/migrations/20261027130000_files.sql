-- NEXUS Bestanden: your own files in a private storage bucket. Each user has one folder,
-- named after their user id; nobody else can list, read, change or delete what is in it.
insert into storage.buckets (id, name, public, file_size_limit)
values ('nexus-files', 'nexus-files', false, 10485760)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

drop policy if exists "Users read their own NEXUS files" on storage.objects;
create policy "Users read their own NEXUS files" on storage.objects
  for select to authenticated
  using (bucket_id = 'nexus-files' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "Users add their own NEXUS files" on storage.objects;
create policy "Users add their own NEXUS files" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'nexus-files' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "Users update their own NEXUS files" on storage.objects;
create policy "Users update their own NEXUS files" on storage.objects
  for update to authenticated
  using (bucket_id = 'nexus-files' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'nexus-files' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "Users delete their own NEXUS files" on storage.objects;
create policy "Users delete their own NEXUS files" on storage.objects
  for delete to authenticated
  using (bucket_id = 'nexus-files' and (storage.foldername(name))[1] = (select auth.uid())::text);
