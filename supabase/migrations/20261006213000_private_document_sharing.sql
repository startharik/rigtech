alter table public.workspace_documents
  add constraint workspace_documents_id_organization_id_key unique (id, organization_id);

create table public.workspace_document_shares (
  organization_id uuid not null,
  document_id uuid not null,
  user_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (document_id, user_id),
  foreign key (document_id, organization_id)
    references public.workspace_documents (id, organization_id) on delete cascade,
  foreign key (organization_id, user_id)
    references public.organization_members (organization_id, user_id) on delete cascade
);

create index workspace_document_shares_user_idx
  on public.workspace_document_shares (organization_id, user_id, document_id);

alter table public.workspace_document_shares enable row level security;
revoke all on public.workspace_document_shares from public, anon, authenticated;
grant select on public.workspace_document_shares to authenticated;

create policy "document owners can view document shares"
on public.workspace_document_shares for select to authenticated
using (
  exists (
    select 1
    from public.workspace_documents d
    where d.id = public.workspace_document_shares.document_id
      and d.organization_id = public.workspace_document_shares.organization_id
      and d.uploaded_by = auth.uid()
  )
);

create or replace function public.current_user_can_access_workspace_document(target_document_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_documents d
    where d.id = target_document_id
      and public.current_user_is_org_member(d.organization_id)
      and (
        d.uploaded_by = auth.uid()
        or d.visible_to_all
        or exists (
          select 1
          from public.workspace_document_shares s
          where s.document_id = d.id
            and s.organization_id = d.organization_id
            and s.user_id = auth.uid()
        )
      )
  );
$$;

revoke all on function public.current_user_can_access_workspace_document(uuid) from public;
grant execute on function public.current_user_can_access_workspace_document(uuid) to authenticated;

create or replace function public.list_workspace_document_share_recipients(target_organization_id uuid)
returns table(user_id uuid, display_name text, email text)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, coalesce(p.full_name, p.name, p.email, 'Workspace member'), p.email
  from public.organization_members om
  join public.profiles p on p.id = om.user_id
  where om.organization_id = target_organization_id
    and om.user_id <> auth.uid()
    and public.current_user_can_access_module('documents', 'manage', target_organization_id)
  order by coalesce(p.full_name, p.name, p.email, 'Workspace member');
$$;

revoke all on function public.list_workspace_document_share_recipients(uuid) from public;
grant execute on function public.list_workspace_document_share_recipients(uuid) to authenticated;

create or replace function public.set_workspace_document_shares(
  target_document_id uuid,
  target_user_ids uuid[] default '{}',
  make_visible_to_all boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_organization_id uuid;
begin
  select d.organization_id
    into target_organization_id
  from public.workspace_documents d
  where d.id = target_document_id
    and d.uploaded_by = auth.uid();

  if target_organization_id is null then
    raise exception 'You do not have permission to change sharing for this document.';
  end if;

  if not public.current_user_is_org_member(target_organization_id) then
    raise exception 'You must be an organization member to share this document.';
  end if;

  if exists (
    select 1
    from unnest(coalesce(target_user_ids, '{}'::uuid[])) requested(user_id)
    where not exists (
      select 1
      from public.organization_members om
      where om.organization_id = target_organization_id
        and om.user_id = requested.user_id
    )
  ) then
    raise exception 'Every selected person must belong to this organization.';
  end if;

  update public.workspace_documents
  set visible_to_all = coalesce(make_visible_to_all, false)
  where id = target_document_id;

  delete from public.workspace_document_shares
  where document_id = target_document_id;

  insert into public.workspace_document_shares (organization_id, document_id, user_id)
  select target_organization_id, target_document_id, requested.user_id
  from (
    select distinct requested.user_id
    from unnest(coalesce(target_user_ids, '{}'::uuid[])) requested(user_id)
  ) requested;
end;
$$;

revoke all on function public.set_workspace_document_shares(uuid, uuid[], boolean) from public;
grant execute on function public.set_workspace_document_shares(uuid, uuid[], boolean) to authenticated;

create or replace function public.current_user_can_access_workspace_folder(target_folder_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with recursive folder_tree(id, organization_id, parent_folder_id) as (
    select f.id, f.organization_id, f.parent_folder_id
    from public.document_folders f
    where f.id = target_folder_id
    union
    select neighbor.id, neighbor.organization_id, neighbor.parent_folder_id
    from public.document_folders neighbor
    join folder_tree current_folder
      on neighbor.organization_id = current_folder.organization_id
     and (
       neighbor.parent_folder_id = current_folder.id
       or current_folder.parent_folder_id = neighbor.id
     )
  )
  select exists (
    select 1
    from folder_tree f
    join public.workspace_documents d
      on d.folder_id = f.id
     and d.organization_id = f.organization_id
    where public.current_user_can_access_workspace_document(d.id)
  );
$$;

revoke all on function public.current_user_can_access_workspace_folder(uuid) from public;
grant execute on function public.current_user_can_access_workspace_folder(uuid) to authenticated;

drop policy if exists "internal members can view document folders" on public.document_folders;
create policy "members can view accessible document folders"
on public.document_folders for select to authenticated
using (
  public.current_user_can_access_module('documents', 'view', organization_id)
  or public.current_user_can_access_workspace_folder(id)
);

drop policy if exists "internal members can view workspace documents" on public.workspace_documents;
drop policy if exists "role_documents_select" on public.workspace_documents;
create policy "members can view accessible workspace documents"
on public.workspace_documents for select to authenticated
using (public.current_user_can_access_workspace_document(id));
create policy "role_documents_select"
on public.workspace_documents as restrictive for select to authenticated
using (public.current_user_can_access_workspace_document(id));

drop policy if exists "internal members can download workspace documents" on storage.objects;
create policy "members can download accessible workspace documents"
on storage.objects for select to authenticated
using (
  bucket_id = 'workspace-documents'
  and exists (
    select 1
    from public.workspace_documents d
    where d.storage_path = name
      and public.current_user_can_access_workspace_document(d.id)
  )
);

drop policy if exists "role storage object select access" on storage.objects;
create policy "role storage object select access"
on storage.objects as restrictive for select to authenticated
using (
  bucket_id not in ('workspace-documents', 'task-attachments')
  or (
    bucket_id = 'workspace-documents'
    and exists (
      select 1
      from public.workspace_documents d
      where d.storage_path = name
        and public.current_user_can_access_workspace_document(d.id)
    )
  )
  or (
    bucket_id = 'task-attachments'
    and exists (
      select 1
      from public.tasks t
      where t.id::text = split_part(name, '/', 2)
        and t.organization_id::text = split_part(name, '/', 1)
        and public.current_user_can_access_task_module(t.id, 'view')
    )
  )
);

revoke update (visible_to_all) on public.workspace_documents from authenticated;
