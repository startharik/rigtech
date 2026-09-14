insert into storage.buckets (id, name, public)
values ('task-attachments', 'task-attachments', false)
on conflict (id) do nothing;

create policy "workspace members can upload task attachments"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'task-attachments'
  and exists (
    select 1
    from public.organization_members om
    where om.user_id = auth.uid()
      and split_part(name, '/', 1)::uuid = om.organization_id
  )
);

create policy "workspace members can read task attachments"
on storage.objects for select to authenticated
using (
  bucket_id = 'task-attachments'
  and exists (
    select 1
    from public.organization_members om
    where om.user_id = auth.uid()
      and split_part(name, '/', 1)::uuid = om.organization_id
  )
);

create policy "workspace members can delete own task attachments"
on storage.objects for delete to authenticated
using (bucket_id = 'task-attachments' and owner_id = auth.uid()::text);
