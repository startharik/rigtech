create table if not exists public.organization_roles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  description text not null default '',
  permissions jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, name),
  check (jsonb_typeof(permissions) = 'object')
);

alter table public.organization_members
  add column if not exists custom_role_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'organization_members_custom_role_fk'
      and conrelid = 'public.organization_members'::regclass
  ) then
    alter table public.organization_members
      add constraint organization_members_custom_role_fk
      foreign key (organization_id, custom_role_id)
      references public.organization_roles (organization_id, id)
      on delete set null (custom_role_id);
  end if;
end
$$;

create index if not exists organization_members_custom_role_idx
  on public.organization_members (organization_id, custom_role_id);

create or replace function public.current_user_can_access_module(
  target_module text,
  target_action text default 'view',
  target_organization_id uuid default null
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  member_role public.member_role;
  assigned_permissions jsonb;
  allowed boolean;
begin
  if auth.uid() is null or target_action not in ('view', 'manage') then
    return false;
  end if;

  select om.role, r.permissions
    into member_role, assigned_permissions
  from public.organization_members om
  left join public.organization_roles r
    on r.id = om.custom_role_id
   and r.organization_id = om.organization_id
  where om.user_id = auth.uid()
    and (target_organization_id is null or om.organization_id = target_organization_id)
  order by om.created_at
  limit 1;

  if member_role is null then
    return false;
  end if;

  if member_role = 'admin' then
    return true;
  end if;

  if assigned_permissions is not null then
    allowed := coalesce((assigned_permissions #>> array[target_module, target_action])::boolean, false);
    if target_action = 'view' then
      return allowed or coalesce((assigned_permissions #>> array[target_module, 'manage'])::boolean, false);
    end if;
    return allowed;
  end if;

  if member_role = 'client' then
    return target_action = 'view'
      and target_module in ('dashboard', 'tasks', 'projects', 'notifications');
  end if;

  if target_module = 'dashboard' then
    return true;
  elsif target_module = 'executive' then
    return member_role in ('manager');
  elsif target_module in ('tasks', 'projects', 'documents', 'departments', 'clients', 'team', 'notifications', 'notes', 'settings') then
    if target_action = 'view' then
      return true;
    end if;
    if target_module = 'tasks' then
      return member_role in ('manager', 'supervisor', 'employee');
    elsif target_module in ('documents', 'notes') then
      return member_role in ('manager', 'supervisor', 'employee');
    elsif target_module in ('projects', 'departments', 'clients', 'team', 'settings') then
      return member_role in ('manager');
    elsif target_module = 'notifications' then
      return member_role in ('manager', 'supervisor', 'employee');
    end if;
    return false;
  elsif target_module = 'stock' then
    return (target_action = 'view' and member_role <> 'client')
      or (target_action = 'manage' and member_role in ('manager', 'supervisor'));
  end if;

  return false;
end;
$$;

revoke all on function public.current_user_can_access_module(text, text, uuid) from public;
grant execute on function public.current_user_can_access_module(text, text, uuid) to authenticated;

create or replace function public.current_user_has_assigned_custom_role(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.organization_members om
    where om.organization_id = target_organization_id
      and om.user_id = auth.uid()
      and om.custom_role_id is not null
  );
$$;

revoke all on function public.current_user_has_assigned_custom_role(uuid) from public;
grant execute on function public.current_user_has_assigned_custom_role(uuid) to authenticated;

create or replace function public.current_user_can_access_note_module(
  target_note_id uuid,
  target_action text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.notes n
    where n.id = target_note_id
      and public.current_user_can_access_module(target_module => 'notes', target_action => target_action, target_organization_id => n.organization_id)
  );
$$;

revoke all on function public.current_user_can_access_note_module(uuid, text) from public;
grant execute on function public.current_user_can_access_note_module(uuid, text) to authenticated;

alter table public.organization_roles enable row level security;
revoke all on public.organization_roles from public, anon, authenticated;
grant select, insert, update, delete on public.organization_roles to authenticated;

create policy "members can view organization roles"
on public.organization_roles for select to authenticated
using (
  public.current_user_can_access_module('team', 'view', organization_id)
  or exists (
    select 1 from public.organization_members om
    where om.organization_id = organization_roles.organization_id
      and om.user_id = auth.uid()
      and om.custom_role_id = organization_roles.id
  )
);

create policy "managers can create organization roles"
on public.organization_roles for insert to authenticated
with check (
  public.current_user_can_manage_org(organization_id)
  and public.current_user_can_access_module('team', 'manage', organization_id)
);

create policy "managers can update organization roles"
on public.organization_roles for update to authenticated
using (
  public.current_user_can_manage_org(organization_id)
  and public.current_user_can_access_module('team', 'manage', organization_id)
)
with check (
  public.current_user_can_manage_org(organization_id)
  and public.current_user_can_access_module('team', 'manage', organization_id)
);

create policy "managers can delete organization roles"
on public.organization_roles for delete to authenticated
using (
  public.current_user_can_manage_org(organization_id)
  and public.current_user_can_access_module('team', 'manage', organization_id)
);

drop policy if exists "members can update tasks" on public.tasks;
create policy "members can update tasks"
on public.tasks for update to authenticated
using (
  organization_id in (select public.current_user_organization_ids())
  and public.current_user_can_access_module('tasks', 'manage', organization_id)
  and (
    created_by = auth.uid()
    or assignee_id = auth.uid()
    or exists (
      select 1 from public.organization_members om
      where om.organization_id = tasks.organization_id
        and om.user_id = auth.uid()
        and (
          om.role in ('admin', 'manager', 'supervisor')
          or (
            om.custom_role_id is not null
            and public.current_user_can_access_module('tasks', 'manage', tasks.organization_id)
          )
        )
    )
  )
)
with check (
  organization_id in (select public.current_user_organization_ids())
  and public.current_user_can_access_module('tasks', 'manage', organization_id)
);

create policy "role task select access"
on public.tasks as restrictive for select to authenticated
using (public.current_user_can_access_module('tasks', 'view', organization_id));
create policy "role task insert access"
on public.tasks as restrictive for insert to authenticated
with check (public.current_user_can_access_module('tasks', 'manage', organization_id));
create policy "role task update access"
on public.tasks as restrictive for update to authenticated
using (public.current_user_can_access_module('tasks', 'manage', organization_id))
with check (public.current_user_can_access_module('tasks', 'manage', organization_id));
create policy "role task delete access"
on public.tasks as restrictive for delete to authenticated
using (public.current_user_can_access_module('tasks', 'manage', organization_id));

drop policy if exists "members can create projects" on public.projects;
create policy "members can create projects"
on public.projects for insert to authenticated
with check (
  organization_id in (select public.current_user_organization_ids())
  and public.current_user_can_access_module('projects', 'manage', organization_id)
);
drop policy if exists "managers can update projects" on public.projects;
create policy "managers can update projects"
on public.projects for update to authenticated
using (public.current_user_can_access_module('projects', 'manage', organization_id))
with check (public.current_user_can_access_module('projects', 'manage', organization_id));

drop policy if exists "members can create departments" on public.departments;
create policy "members can create departments"
on public.departments for insert to authenticated
with check (public.current_user_can_access_module('departments', 'manage', organization_id));
drop policy if exists "members can create teams" on public.teams;
create policy "members can create teams"
on public.teams for insert to authenticated
with check (public.current_user_can_access_module('departments', 'manage', organization_id));
drop policy if exists "members can create clients" on public.clients;
create policy "members can create clients"
on public.clients for insert to authenticated
with check (public.current_user_can_access_module('clients', 'manage', organization_id));

drop policy if exists "managers can update departments" on public.departments;
create policy "managers can update departments"
on public.departments for update to authenticated
using (public.current_user_can_access_module('departments', 'manage', organization_id))
with check (public.current_user_can_access_module('departments', 'manage', organization_id));
drop policy if exists "managers can update teams" on public.teams;
create policy "managers can update teams"
on public.teams for update to authenticated
using (public.current_user_can_access_module('departments', 'manage', organization_id))
with check (public.current_user_can_access_module('departments', 'manage', organization_id));
drop policy if exists "managers can update clients" on public.clients;
create policy "managers can update clients"
on public.clients for update to authenticated
using (public.current_user_can_access_module('clients', 'manage', organization_id))
with check (public.current_user_can_access_module('clients', 'manage', organization_id));

drop policy if exists "managers can create stock items" on public.stock_items;
create policy "managers can create stock items"
on public.stock_items for insert to authenticated
with check (public.current_user_can_access_module('stock', 'manage', organization_id));
drop policy if exists "managers can update stock items" on public.stock_items;
create policy "managers can update stock items"
on public.stock_items for update to authenticated
using (public.current_user_can_access_module('stock', 'manage', organization_id))
with check (public.current_user_can_access_module('stock', 'manage', organization_id));
drop policy if exists "managers can create stock categories" on public.stock_categories;
create policy "managers can create stock categories"
on public.stock_categories for insert to authenticated
with check (public.current_user_can_access_module('stock', 'manage', organization_id));

drop policy if exists "internal members can view stock items" on public.stock_items;
create policy "internal members can view stock items"
on public.stock_items for select to authenticated
using (public.current_user_can_access_module('stock', 'view', organization_id));
drop policy if exists "internal members can view stock categories" on public.stock_categories;
create policy "internal members can view stock categories"
on public.stock_categories for select to authenticated
using (public.current_user_can_access_module('stock', 'view', organization_id));
drop policy if exists "internal members can view stock movements" on public.stock_movements;
create policy "internal members can view stock movements"
on public.stock_movements for select to authenticated
using (public.current_user_can_access_module('stock', 'view', organization_id));

drop policy if exists "internal members can view document folders" on public.document_folders;
create policy "internal members can view document folders"
on public.document_folders for select to authenticated
using (public.current_user_can_access_module('documents', 'view', organization_id));
drop policy if exists "internal members can create document folders" on public.document_folders;
create policy "internal members can create document folders"
on public.document_folders for insert to authenticated
with check (
  public.current_user_can_access_module('documents', 'manage', organization_id)
  and created_by = auth.uid()
);
drop policy if exists "internal members can view workspace documents" on public.workspace_documents;
create policy "internal members can view workspace documents"
on public.workspace_documents for select to authenticated
using (public.current_user_can_access_module('documents', 'view', organization_id));
drop policy if exists "internal members can upload workspace documents" on public.workspace_documents;
create policy "internal members can upload workspace documents"
on public.workspace_documents for insert to authenticated
with check (
  public.current_user_can_access_module('documents', 'manage', organization_id)
  and uploaded_by = auth.uid()
);
drop policy if exists "internal members can tag workspace documents" on public.workspace_documents;
create policy "internal members can tag workspace documents"
on public.workspace_documents for update to authenticated
using (public.current_user_can_access_module('documents', 'manage', organization_id))
with check (public.current_user_can_access_module('documents', 'manage', organization_id));

drop policy if exists "managers can delete workspace documents" on public.workspace_documents;
create policy "managers can delete workspace documents"
on public.workspace_documents for delete to authenticated
using (
  public.current_user_can_access_module('documents', 'manage', organization_id)
  and (
    public.current_user_can_manage_org(organization_id)
    or exists (
      select 1 from public.organization_members om
      where om.organization_id = workspace_documents.organization_id
        and om.user_id = auth.uid()
        and om.role = 'supervisor'
    )
    or public.current_user_has_assigned_custom_role(organization_id)
  )
);
drop policy if exists "managers can delete workspace documents from storage" on storage.objects;
create policy "managers can delete workspace documents from storage"
on storage.objects for delete to authenticated
using (
  bucket_id = 'workspace-documents'
  and exists (
    select 1 from public.workspace_documents d
    where d.storage_path = name
      and public.current_user_can_access_module('documents', 'manage', d.organization_id)
      and (
        public.current_user_can_manage_org(d.organization_id)
        or exists (
          select 1 from public.organization_members om
          where om.organization_id = d.organization_id
            and om.user_id = auth.uid()
            and om.role = 'supervisor'
        )
        or public.current_user_has_assigned_custom_role(d.organization_id)
      )
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
      and public.current_user_can_access_module('documents', 'view', d.organization_id)
  )
);
drop policy if exists "members can upload their workspace documents" on storage.objects;
create policy "members can upload their workspace documents"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'workspace-documents'
  and exists (
    select 1 from public.workspace_documents d
    where d.storage_path = name
      and d.uploaded_by = auth.uid()
      and public.current_user_can_access_module('documents', 'manage', d.organization_id)
  )
);

drop policy if exists "managers can manage project milestones" on public.project_milestones;
create policy "managers can manage project milestones"
on public.project_milestones for all to authenticated
using (public.current_user_can_access_module('projects', 'manage', organization_id))
with check (public.current_user_can_access_module('projects', 'manage', organization_id));

do $$
declare
  resource record;
  policy_action text;
begin
  for resource in
    select * from (values
      ('projects', 'projects'),
      ('project_milestones', 'projects'),
      ('stock_items', 'stock'),
      ('stock_categories', 'stock'),
      ('stock_movements', 'stock'),
      ('document_folders', 'documents'),
      ('workspace_documents', 'documents'),
      ('clients', 'clients'),
      ('departments', 'departments'),
      ('teams', 'departments'),
      ('member_availability', 'team'),
      ('employee_workload_limits', 'team'),
      ('task_audit_events', 'tasks'),
      ('notification_preferences', 'notifications')
    ) as resources(table_name, module_name)
  loop
    execute format('create policy %I on public.%I as restrictive for select to authenticated using (public.current_user_can_access_module(%L, %L, organization_id))',
      'role_' || resource.module_name || '_select', resource.table_name, resource.module_name, 'view');
    execute format('create policy %I on public.%I as restrictive for insert to authenticated with check (public.current_user_can_access_module(%L, %L, organization_id))',
      'role_' || resource.module_name || '_insert', resource.table_name, resource.module_name, 'manage');
    execute format('create policy %I on public.%I as restrictive for update to authenticated using (public.current_user_can_access_module(%L, %L, organization_id)) with check (public.current_user_can_access_module(%L, %L, organization_id))',
      'role_' || resource.module_name || '_update', resource.table_name, resource.module_name, 'manage', resource.module_name, 'manage');
    execute format('create policy %I on public.%I as restrictive for delete to authenticated using (public.current_user_can_access_module(%L, %L, organization_id))',
      'role_' || resource.module_name || '_delete', resource.table_name, resource.module_name, 'manage');
  end loop;
end
$$;

create policy "role organization settings access"
on public.organizations as restrictive for update to authenticated
using (public.current_user_can_access_module('settings', 'manage', id))
with check (public.current_user_can_access_module('settings', 'manage', id));

drop policy if exists "managers can update organization settings" on public.organizations;
create policy "managers can update organization settings"
on public.organizations for update to authenticated
using (public.current_user_can_access_module('settings', 'manage', id))
with check (
  id in (select public.current_user_organization_ids())
  and public.current_user_can_access_module('settings', 'manage', id)
);

create policy "role membership select access"
on public.organization_members as restrictive for select to authenticated
using (
  user_id = auth.uid()
  or public.current_user_can_access_module('team', 'view', organization_id)
);
create policy "role membership insert access"
on public.organization_members as restrictive for insert to authenticated
with check (public.current_user_can_access_module('team', 'manage', organization_id));
create policy "role membership update access"
on public.organization_members as restrictive for update to authenticated
using (public.current_user_can_access_module('team', 'manage', organization_id))
with check (public.current_user_can_access_module('team', 'manage', organization_id));
create policy "role membership delete access"
on public.organization_members as restrictive for delete to authenticated
using (public.current_user_can_access_module('team', 'manage', organization_id));

create policy "role profile directory access"
on public.profiles as restrictive for select to authenticated
using (
  id = auth.uid()
  or exists (
    select 1 from public.organization_members om
    where om.user_id = profiles.id
      and public.current_user_can_access_module('team', 'view', om.organization_id)
  )
);

create policy "role note select access"
on public.notes as restrictive for select to authenticated
using (public.current_user_can_access_module('notes', 'view', organization_id));
create policy "role note insert access"
on public.notes as restrictive for insert to authenticated
with check (public.current_user_can_access_module('notes', 'manage', organization_id));
create policy "role note update access"
on public.notes as restrictive for update to authenticated
using (public.current_user_can_access_module('notes', 'manage', organization_id))
with check (public.current_user_can_access_module('notes', 'manage', organization_id));
create policy "role note delete access"
on public.notes as restrictive for delete to authenticated
using (public.current_user_can_access_module('notes', 'manage', organization_id));

create policy "role note share select access"
on public.note_shares as restrictive for select to authenticated
using (public.current_user_can_access_note_module(note_id, 'view'));
create policy "role note share insert access"
on public.note_shares as restrictive for insert to authenticated
with check (public.current_user_can_access_note_module(note_id, 'manage'));
create policy "role note share update access"
on public.note_shares as restrictive for update to authenticated
using (public.current_user_can_access_note_module(note_id, 'manage'))
with check (public.current_user_can_access_note_module(note_id, 'manage'));
create policy "role note share delete access"
on public.note_shares as restrictive for delete to authenticated
using (public.current_user_can_access_note_module(note_id, 'manage'));

create policy "role notification select access"
on public.notifications as restrictive for select to authenticated
using (
  user_id = auth.uid()
  and public.current_user_can_access_module('notifications', 'view')
);
create policy "role notification insert access"
on public.notifications as restrictive for insert to authenticated
with check (public.current_user_can_access_module('notifications', 'manage'));
create policy "role notification update access"
on public.notifications as restrictive for update to authenticated
using (user_id = auth.uid() and public.current_user_can_access_module('notifications', 'manage'))
with check (user_id = auth.uid() and public.current_user_can_access_module('notifications', 'manage'));
create policy "role notification delete access"
on public.notifications as restrictive for delete to authenticated
using (public.current_user_can_access_module('notifications', 'manage'));

create or replace function public.current_user_can_access_task_module(
  target_task_id uuid,
  target_action text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.tasks t
    where t.id = target_task_id
      and public.current_user_can_access_module('tasks', target_action, t.organization_id)
  );
$$;

revoke all on function public.current_user_can_access_task_module(uuid, text) from public;
grant execute on function public.current_user_can_access_task_module(uuid, text) to authenticated;

do $$
declare
  resource record;
  operation text;
  access_action text;
begin
  for resource in
    select * from (values ('task_members'), ('comments'), ('attachments')) as resources(table_name)
  loop
    foreach operation in array array['select', 'insert', 'update', 'delete']
    loop
      access_action := case when operation = 'select' then 'view' else 'manage' end;
      if operation in ('select', 'delete') then
        execute format('create policy %I on public.%I as restrictive for %s to authenticated using (public.current_user_can_access_task_module(task_id, %L))',
          'role_tasks_' || operation, resource.table_name, operation, access_action);
      elsif operation = 'insert' then
        execute format('create policy %I on public.%I as restrictive for insert to authenticated with check (public.current_user_can_access_task_module(task_id, %L))',
          'role_tasks_insert', resource.table_name, access_action);
      else
        execute format('create policy %I on public.%I as restrictive for update to authenticated using (public.current_user_can_access_task_module(task_id, %L)) with check (public.current_user_can_access_task_module(task_id, %L))',
          'role_tasks_update', resource.table_name, access_action, access_action);
      end if;
    end loop;
  end loop;
end
$$;

create or replace function public.current_user_can_access_client_module(
  target_client_id uuid,
  target_action text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.clients c
    where c.id = target_client_id
      and public.current_user_can_access_module('clients', target_action, c.organization_id)
  );
$$;

create or replace function public.current_user_can_access_client_user_module(
  target_user_id uuid,
  target_action text
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
    where om.user_id = target_user_id
      and public.current_user_can_access_module('clients', target_action, om.organization_id)
  );
$$;

revoke all on function public.current_user_can_access_client_module(uuid, text) from public;
revoke all on function public.current_user_can_access_client_user_module(uuid, text) from public;
grant execute on function public.current_user_can_access_client_module(uuid, text) to authenticated;
grant execute on function public.current_user_can_access_client_user_module(uuid, text) to authenticated;

create policy "role client user select access"
on public.client_users as restrictive for select to authenticated
using (
  user_id = auth.uid()
  or public.current_user_can_access_client_module(client_id, 'view')
);
create policy "members with client access can view client links"
on public.client_users for select to authenticated
using (public.current_user_can_access_client_module(client_id, 'view'));
create policy "role client user insert access"
on public.client_users as restrictive for insert to authenticated
with check (public.current_user_can_access_client_module(client_id, 'manage'));
create policy "role client user update access"
on public.client_users as restrictive for update to authenticated
using (public.current_user_can_access_client_module(client_id, 'manage'))
with check (public.current_user_can_access_client_module(client_id, 'manage'));
create policy "role client user delete access"
on public.client_users as restrictive for delete to authenticated
using (public.current_user_can_access_client_module(client_id, 'manage'));

create policy "role storage object select access"
on storage.objects as restrictive for select to authenticated
using (
  bucket_id not in ('workspace-documents', 'task-attachments')
  or (
    bucket_id = 'workspace-documents'
    and exists (
      select 1 from public.workspace_documents d
      where d.storage_path = name
        and public.current_user_can_access_module('documents', 'view', d.organization_id)
    )
  )
  or (
    bucket_id = 'task-attachments'
    and exists (
      select 1 from public.tasks t
      where t.id::text = split_part(name, '/', 2)
        and t.organization_id::text = split_part(name, '/', 1)
        and public.current_user_can_access_module('tasks', 'view', t.organization_id)
    )
  )
);
create policy "role storage object insert access"
on storage.objects as restrictive for insert to authenticated
with check (
  bucket_id not in ('workspace-documents', 'task-attachments')
  or (
    bucket_id = 'workspace-documents'
    and exists (
      select 1 from public.workspace_documents d
      where d.storage_path = name
        and public.current_user_can_access_module('documents', 'manage', d.organization_id)
    )
  )
  or (
    bucket_id = 'task-attachments'
    and exists (
      select 1 from public.tasks t
      where t.id::text = split_part(name, '/', 2)
        and t.organization_id::text = split_part(name, '/', 1)
        and public.current_user_can_access_module('tasks', 'manage', t.organization_id)
    )
  )
);
create policy "role storage object update access"
on storage.objects as restrictive for update to authenticated
using (
  bucket_id not in ('workspace-documents', 'task-attachments')
  or (
    bucket_id = 'workspace-documents'
    and exists (
      select 1 from public.workspace_documents d
      where d.storage_path = name
        and public.current_user_can_access_module('documents', 'manage', d.organization_id)
    )
  )
)
with check (
  bucket_id not in ('workspace-documents', 'task-attachments')
  or (
    bucket_id = 'workspace-documents'
    and exists (
      select 1 from public.workspace_documents d
      where d.storage_path = name
        and public.current_user_can_access_module('documents', 'manage', d.organization_id)
    )
  )
);
create policy "role storage object delete access"
on storage.objects as restrictive for delete to authenticated
using (
  bucket_id not in ('workspace-documents', 'task-attachments')
  or (
    bucket_id = 'workspace-documents'
    and exists (
      select 1 from public.workspace_documents d
      where d.storage_path = name
        and public.current_user_can_access_module('documents', 'manage', d.organization_id)
    )
  )
  or (
    bucket_id = 'task-attachments'
    and exists (
      select 1 from public.tasks t
      where t.id::text = split_part(name, '/', 2)
        and t.organization_id::text = split_part(name, '/', 1)
        and public.current_user_can_access_module('tasks', 'manage', t.organization_id)
    )
  )
);

alter view public.task_tree set (security_invoker = true);

create or replace function public.record_stock_movement_with_role(
  p_organization_id uuid,
  p_stock_item_id uuid,
  p_movement_type text,
  p_quantity numeric,
  p_movement_date date,
  p_ordered_quantity numeric default null,
  p_purchase_order text default null,
  p_project_number text default null,
  p_delivery_note text default null,
  p_area text default null,
  p_mtc text default null,
  p_unit_price numeric default null,
  p_comments text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  item_quantity numeric(14,3);
  new_movement_id uuid;
begin
  if not public.current_user_can_access_module('stock', 'manage', p_organization_id) then
    raise exception 'You do not have permission to manage stock in this organization.';
  end if;
  if p_movement_type is null or p_movement_type not in ('receipt', 'issue') then
    raise exception 'Movement type must be receipt or issue.';
  end if;
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Quantity must be greater than zero.';
  end if;
  if p_ordered_quantity is not null and p_ordered_quantity < 0 then
    raise exception 'Ordered quantity cannot be negative.';
  end if;
  if p_unit_price is not null and p_unit_price < 0 then
    raise exception 'Unit price cannot be negative.';
  end if;

  select quantity_on_hand
    into item_quantity
  from public.stock_items
  where id = p_stock_item_id and organization_id = p_organization_id
  for update;

  if not found then
    raise exception 'The selected stock item is not available in this organization.';
  end if;
  if p_movement_type = 'issue' and p_quantity > item_quantity then
    raise exception 'Insufficient stock. Available quantity: %.', item_quantity;
  end if;

  update public.stock_items
  set quantity_on_hand = item_quantity + case when p_movement_type = 'receipt' then p_quantity else -p_quantity end,
      last_unit_price = case
        when p_movement_type = 'receipt' and p_unit_price is not null then p_unit_price
        else last_unit_price
      end
  where id = p_stock_item_id and organization_id = p_organization_id;

  insert into public.stock_movements (
    organization_id, stock_item_id, movement_type, quantity, ordered_quantity,
    movement_date, purchase_order, project_number, delivery_note, area, mtc,
    unit_price, comments, recorded_by
  )
  values (
    p_organization_id, p_stock_item_id, p_movement_type, p_quantity,
    case when p_movement_type = 'receipt' then p_ordered_quantity else null end,
    coalesce(p_movement_date, current_date),
    case when p_movement_type = 'receipt' then nullif(trim(p_purchase_order), '') else null end,
    nullif(trim(p_project_number), ''),
    case when p_movement_type = 'receipt' then nullif(trim(p_delivery_note), '') else null end,
    case when p_movement_type = 'issue' then nullif(trim(p_area), '') else null end,
    case when p_movement_type = 'receipt' then nullif(trim(p_mtc), '') else null end,
    case when p_movement_type = 'receipt' then p_unit_price else null end,
    nullif(trim(p_comments), ''), auth.uid()
  )
  returning id into new_movement_id;

  return new_movement_id;
end;
$$;

create or replace function public.delete_stock_item_with_role(
  p_organization_id uuid,
  p_stock_item_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  item_quantity numeric(14,3);
begin
  if not public.current_user_can_access_module('stock', 'manage', p_organization_id) then
    raise exception 'You do not have permission to manage stock in this organization.';
  end if;

  select quantity_on_hand
    into item_quantity
  from public.stock_items
  where id = p_stock_item_id and organization_id = p_organization_id
  for update;

  if not found then
    raise exception 'The selected stock item is not available in this organization.';
  end if;
  if item_quantity <> 0 then
    raise exception 'This item still has % units in stock. Record issues until the balance is zero before deleting it.', item_quantity;
  end if;
  if exists (
    select 1 from public.stock_movements
    where stock_item_id = p_stock_item_id
      and organization_id = p_organization_id
  ) then
    raise exception 'This item has movement history and cannot be deleted, so the inventory ledger remains intact.';
  end if;

  delete from public.stock_items
  where id = p_stock_item_id and organization_id = p_organization_id;
end;
$$;

revoke all on function public.record_stock_movement_with_role(uuid, uuid, text, numeric, date, numeric, text, text, text, text, text, numeric, text) from public;
revoke all on function public.delete_stock_item_with_role(uuid, uuid) from public;
grant execute on function public.record_stock_movement_with_role(uuid, uuid, text, numeric, date, numeric, text, text, text, text, text, numeric, text) to authenticated;
grant execute on function public.delete_stock_item_with_role(uuid, uuid) to authenticated;
revoke execute on function public.record_stock_movement(uuid, uuid, text, numeric, date, numeric, text, text, text, text, text, numeric, text) from authenticated;
revoke execute on function public.delete_stock_item(uuid, uuid) from authenticated;
