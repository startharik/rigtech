alter table public.projects
  add constraint projects_id_organization_id_key unique (id, organization_id);

create table if not exists public.document_folders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  parent_folder_id uuid,
  name text not null check (
    length(name) between 1 and 80
    and name = trim(name)
    and position('/' in name) = 0
    and position(chr(92) in name) = 0
  ),
  created_by uuid not null default auth.uid() references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (parent_folder_id, organization_id)
    references public.document_folders (id, organization_id) on delete restrict
);

create unique index if not exists document_folders_root_name_idx
  on public.document_folders (organization_id, lower(name))
  where parent_folder_id is null;
create unique index if not exists document_folders_nested_name_idx
  on public.document_folders (organization_id, parent_folder_id, lower(name))
  where parent_folder_id is not null;

create table if not exists public.workspace_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  folder_id uuid,
  project_id uuid,
  file_name text not null check (length(file_name) between 1 and 255),
  storage_path text not null unique,
  mime_type text,
  file_size bigint not null check (file_size >= 0 and file_size <= 52428800),
  uploaded_by uuid not null default auth.uid() references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  check (storage_path like (organization_id::text || '/' || id::text || '/%')),
  foreign key (folder_id, organization_id)
    references public.document_folders (id, organization_id) on delete restrict,
  foreign key (project_id, organization_id)
    references public.projects (id, organization_id) on delete restrict
);

create index if not exists document_folders_org_parent_name_idx
  on public.document_folders (organization_id, parent_folder_id, name);
create index if not exists workspace_documents_org_folder_created_idx
  on public.workspace_documents (organization_id, folder_id, created_at desc);
create index if not exists workspace_documents_org_project_idx
  on public.workspace_documents (organization_id, project_id);

create or replace function public.current_user_is_internal_org_member(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members om
    where om.organization_id = target_organization_id
      and om.user_id = auth.uid()
      and om.role <> 'client'
  );
$$;

revoke all on function public.current_user_is_internal_org_member(uuid) from public;
grant execute on function public.current_user_is_internal_org_member(uuid) to authenticated;

alter table public.document_folders enable row level security;
alter table public.workspace_documents enable row level security;

create policy "internal members can view document folders"
on public.document_folders for select to authenticated
using (public.current_user_is_internal_org_member(organization_id));

create policy "internal members can create document folders"
on public.document_folders for insert to authenticated
with check (
  public.current_user_is_internal_org_member(organization_id)
  and created_by = auth.uid()
);

create policy "internal members can view workspace documents"
on public.workspace_documents for select to authenticated
using (public.current_user_is_internal_org_member(organization_id));

create policy "internal members can upload workspace documents"
on public.workspace_documents for insert to authenticated
with check (
  public.current_user_is_internal_org_member(organization_id)
  and uploaded_by = auth.uid()
);

create policy "internal members can tag workspace documents"
on public.workspace_documents for update to authenticated
using (public.current_user_is_internal_org_member(organization_id))
with check (public.current_user_is_internal_org_member(organization_id));

create policy "managers can delete workspace documents"
on public.workspace_documents for delete to authenticated
using (public.current_user_can_manage_org(organization_id));

revoke all on public.document_folders, public.workspace_documents from public, anon, authenticated;
grant select on public.document_folders, public.workspace_documents to authenticated;
grant insert (organization_id, parent_folder_id, name)
  on public.document_folders to authenticated;
grant insert (id, organization_id, folder_id, project_id, file_name, storage_path, mime_type, file_size)
  on public.workspace_documents to authenticated;
grant update (folder_id, project_id)
  on public.workspace_documents to authenticated;
grant delete on public.workspace_documents to authenticated;

insert into storage.buckets (id, name, public, file_size_limit)
values ('workspace-documents', 'workspace-documents', false, 52428800)
on conflict (id) do update
set public = false, file_size_limit = excluded.file_size_limit;

create policy "internal members can download workspace documents"
on storage.objects for select to authenticated
using (
  bucket_id = 'workspace-documents'
  and exists (
    select 1
    from public.workspace_documents d
    where d.storage_path = name
      and public.current_user_is_internal_org_member(d.organization_id)
  )
);

create policy "members can upload their workspace documents"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'workspace-documents'
  and exists (
    select 1
    from public.workspace_documents d
    where d.storage_path = name
      and d.uploaded_by = auth.uid()
      and public.current_user_is_internal_org_member(d.organization_id)
  )
);

create policy "managers can delete workspace documents from storage"
on storage.objects for delete to authenticated
using (
  bucket_id = 'workspace-documents'
  and exists (
    select 1
    from public.workspace_documents d
    where d.storage_path = name
      and public.current_user_can_manage_org(d.organization_id)
  )
);
