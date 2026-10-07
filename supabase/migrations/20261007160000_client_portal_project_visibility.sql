create or replace function public.current_user_can_access_project(
  target_project_id uuid,
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
    from public.projects p
    join public.organization_members om
      on om.organization_id = p.organization_id
     and om.user_id = auth.uid()
    where p.id = target_project_id
      and (
        (
          om.role = 'client'
          and target_action = 'view'
          and exists (
            select 1
            from public.client_users cu
            where cu.client_id = p.client_id
              and cu.user_id = auth.uid()
          )
        )
        or (
          om.role <> 'client'
          and public.current_user_can_access_module('projects', target_action, p.organization_id)
        )
      )
  );
$$;

revoke all on function public.current_user_can_access_project(uuid, text) from public, anon;
grant execute on function public.current_user_can_access_project(uuid, text) to authenticated;

drop policy if exists "role_projects_select" on public.projects;
create policy "role_projects_select"
on public.projects as restrictive for select to authenticated
using (public.current_user_can_access_project(id, 'view'));

drop policy if exists "role_projects_insert" on public.projects;
create policy "role_projects_insert"
on public.projects as restrictive for insert to authenticated
with check (
  exists (
    select 1 from public.organization_members om
    where om.organization_id = projects.organization_id
      and om.user_id = auth.uid()
      and om.role <> 'client'
  )
  and public.current_user_can_access_module('projects', 'manage', organization_id)
);

drop policy if exists "role_projects_update" on public.projects;
create policy "role_projects_update"
on public.projects as restrictive for update to authenticated
using (public.current_user_can_access_project(id, 'manage'))
with check (
  exists (
    select 1 from public.organization_members om
    where om.organization_id = projects.organization_id
      and om.user_id = auth.uid()
      and om.role <> 'client'
  )
  and public.current_user_can_access_module('projects', 'manage', organization_id)
);

drop policy if exists "role_projects_delete" on public.projects;
create policy "role_projects_delete"
on public.projects as restrictive for delete to authenticated
using (public.current_user_can_access_project(id, 'manage'));

drop policy if exists "role_clients_select" on public.clients;
create policy "role_clients_select"
on public.clients as restrictive for select to authenticated
using (
  exists (
    select 1
    from public.organization_members om
    where om.organization_id = clients.organization_id
      and om.user_id = auth.uid()
      and (
        (
          om.role = 'client'
          and exists (
            select 1
            from public.client_users cu
            where cu.client_id = clients.id
              and cu.user_id = auth.uid()
          )
        )
        or (
          om.role <> 'client'
          and public.current_user_can_access_module('clients', 'view', clients.organization_id)
        )
      )
  )
);

drop policy if exists "role_clients_insert" on public.clients;
create policy "role_clients_insert"
on public.clients as restrictive for insert to authenticated
with check (
  exists (
    select 1 from public.organization_members om
    where om.organization_id = clients.organization_id
      and om.user_id = auth.uid()
      and om.role <> 'client'
  )
  and public.current_user_can_access_module('clients', 'manage', organization_id)
);

drop policy if exists "role_clients_update" on public.clients;
create policy "role_clients_update"
on public.clients as restrictive for update to authenticated
using (
  exists (
    select 1 from public.organization_members om
    where om.organization_id = clients.organization_id
      and om.user_id = auth.uid()
      and om.role <> 'client'
  )
  and public.current_user_can_access_module('clients', 'manage', organization_id)
)
with check (
  exists (
    select 1 from public.organization_members om
    where om.organization_id = clients.organization_id
      and om.user_id = auth.uid()
      and om.role <> 'client'
  )
  and public.current_user_can_access_module('clients', 'manage', organization_id)
);

drop policy if exists "role_clients_delete" on public.clients;
create policy "role_clients_delete"
on public.clients as restrictive for delete to authenticated
using (
  exists (
    select 1 from public.organization_members om
    where om.organization_id = clients.organization_id
      and om.user_id = auth.uid()
      and om.role <> 'client'
  )
  and public.current_user_can_access_module('clients', 'manage', organization_id)
);

drop policy if exists "role_projects_select" on public.project_milestones;
create policy "role_projects_select"
on public.project_milestones as restrictive for select to authenticated
using (public.current_user_can_access_project(project_id, 'view'));

drop policy if exists "role_projects_insert" on public.project_milestones;
create policy "role_projects_insert"
on public.project_milestones as restrictive for insert to authenticated
with check (
  exists (
    select 1 from public.organization_members om
    where om.organization_id = project_milestones.organization_id
      and om.user_id = auth.uid()
      and om.role <> 'client'
  )
  and public.current_user_can_access_module('projects', 'manage', organization_id)
);

drop policy if exists "role_projects_update" on public.project_milestones;
create policy "role_projects_update"
on public.project_milestones as restrictive for update to authenticated
using (public.current_user_can_access_project(project_id, 'manage'))
with check (
  exists (
    select 1 from public.organization_members om
    where om.organization_id = project_milestones.organization_id
      and om.user_id = auth.uid()
      and om.role <> 'client'
  )
  and public.current_user_can_access_module('projects', 'manage', organization_id)
);

drop policy if exists "role_projects_delete" on public.project_milestones;
create policy "role_projects_delete"
on public.project_milestones as restrictive for delete to authenticated
using (public.current_user_can_access_project(project_id, 'manage'));
