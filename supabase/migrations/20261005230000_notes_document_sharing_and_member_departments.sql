create or replace function public.current_user_can_create_workspace_note(
  target_organization_id uuid
)
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
      and public.current_user_can_access_module('notes', 'manage', om.organization_id)
  );
$$;

revoke all on function public.current_user_can_create_workspace_note(uuid) from public;
grant execute on function public.current_user_can_create_workspace_note(uuid) to authenticated;

drop policy if exists "members can create workspace notes" on public.notes;
create policy "members can create workspace notes"
on public.notes for insert to authenticated
with check (
  author_id = auth.uid()
  and public.current_user_can_create_workspace_note(organization_id)
);

drop policy if exists "role note insert access" on public.notes;
create policy "role note insert access"
on public.notes as restrictive for insert to authenticated
with check (
  author_id = auth.uid()
  and public.current_user_can_create_workspace_note(organization_id)
);

alter table public.workspace_documents
  add column if not exists visible_to_all boolean not null default false;

create or replace function public.current_user_is_org_member(target_organization_id uuid)
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
  );
$$;

revoke all on function public.current_user_is_org_member(uuid) from public;
grant execute on function public.current_user_is_org_member(uuid) to authenticated;

grant update (folder_id, project_id, visible_to_all)
  on public.workspace_documents to authenticated;

drop policy if exists "internal members can view workspace documents" on public.workspace_documents;
create policy "internal members can view workspace documents"
on public.workspace_documents for select to authenticated
using (
  public.current_user_can_access_module('documents', 'view', organization_id)
  or (
    visible_to_all
    and public.current_user_is_org_member(organization_id)
  )
);

drop policy if exists "role_documents_select" on public.workspace_documents;
create policy "role_documents_select"
on public.workspace_documents as restrictive for select to authenticated
using (
  public.current_user_can_access_module('documents', 'view', organization_id)
  or (
    visible_to_all
    and public.current_user_is_org_member(organization_id)
  )
);

drop policy if exists "internal members can download workspace documents" on storage.objects;
create policy "internal members can download workspace documents"
on storage.objects for select to authenticated
using (
  bucket_id = 'workspace-documents'
  and exists (
    select 1 from public.workspace_documents d
    where d.storage_path = name
      and (
        public.current_user_can_access_module('documents', 'view', d.organization_id)
        or (
          d.visible_to_all
          and public.current_user_is_org_member(d.organization_id)
        )
      )
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
      select 1 from public.workspace_documents d
      where d.storage_path = name
        and (
          public.current_user_can_access_module('documents', 'view', d.organization_id)
          or (
            d.visible_to_all
            and public.current_user_is_org_member(d.organization_id)
          )
        )
    )
  )
  or (
    bucket_id = 'task-attachments'
    and exists (
      select 1 from public.tasks t
      where t.id::text = split_part(name, '/', 2)
        and t.organization_id::text = split_part(name, '/', 1)
        and public.current_user_can_access_task_module(t.id, 'view')
    )
  )
);

alter table public.departments
  add constraint departments_id_organization_id_key unique (id, organization_id);

create table if not exists public.organization_member_departments (
  organization_id uuid not null,
  user_id uuid not null,
  department_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id, department_id),
  foreign key (organization_id, user_id)
    references public.organization_members (organization_id, user_id)
    on delete cascade,
  foreign key (department_id, organization_id)
    references public.departments (id, organization_id)
    on delete cascade
);

insert into public.organization_member_departments (organization_id, user_id, department_id)
select organization_id, user_id, department_id
from public.organization_members
where department_id is not null
on conflict do nothing;

create index if not exists organization_member_departments_department_idx
  on public.organization_member_departments (organization_id, department_id);

alter table public.organization_member_departments enable row level security;
revoke all on public.organization_member_departments from public, anon, authenticated;
grant select on public.organization_member_departments to authenticated;

create policy "members can view employee department assignments"
on public.organization_member_departments for select to authenticated
using (
  user_id = auth.uid()
  or public.current_user_can_access_module('team', 'view', organization_id)
);

create or replace function public.replace_member_departments(
  target_organization_id uuid,
  target_user_id uuid,
  target_department_ids uuid[]
)
returns uuid[]
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_department_ids uuid[];
  target_member_role public.member_role;
begin
  if auth.role() <> 'service_role'
     and (
       auth.uid() is null
       or not public.current_user_can_access_module('team', 'manage', target_organization_id)
     ) then
    raise exception 'You do not have permission to manage employee department assignments.';
  end if;

  select role
    into target_member_role
  from public.organization_members
  where organization_id = target_organization_id
    and user_id = target_user_id
  for update;

  if not found or target_member_role = 'client' then
    raise exception 'The employee membership was not found in this organization.';
  end if;

  select coalesce(array_agg(department_id order by first_position), '{}'::uuid[])
    into normalized_department_ids
  from (
    select department_id, min(position) as first_position
    from unnest(coalesce(target_department_ids, '{}'::uuid[])) with ordinality as selected(department_id, position)
    where department_id is not null
    group by department_id
  ) selected_departments;

  if exists (
    select 1
    from unnest(normalized_department_ids) as selected(department_id)
    where not exists (
      select 1
      from public.departments d
      where d.id = selected.department_id
        and d.organization_id = target_organization_id
    )
  ) then
    raise exception 'Every selected department must belong to this organization.';
  end if;

  delete from public.organization_member_departments
  where organization_id = target_organization_id
    and user_id = target_user_id;

  insert into public.organization_member_departments (organization_id, user_id, department_id)
  select target_organization_id, target_user_id, selected.department_id
  from unnest(normalized_department_ids) as selected(department_id);

  update public.organization_members
  set department_id = normalized_department_ids[1]
  where organization_id = target_organization_id
    and user_id = target_user_id;

  return normalized_department_ids;
end;
$$;

revoke all on function public.replace_member_departments(uuid, uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.replace_member_departments(uuid, uuid, uuid[]) to service_role;
