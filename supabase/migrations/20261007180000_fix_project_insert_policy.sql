-- Keep project creation available to members who have project-management access.
-- This permissive policy works together with role_projects_insert, which
-- restricts inserts to internal members and enforces module permissions.
drop policy if exists "members can create projects" on public.projects;
create policy "members can create projects"
on public.projects as permissive for insert to authenticated
with check (
  organization_id in (select public.current_user_organization_ids())
  and public.current_user_can_access_module('projects', 'manage', organization_id)
);
