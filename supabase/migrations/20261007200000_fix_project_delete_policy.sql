-- Pair the restrictive role check with a permissive policy so authorized
-- organization members can actually delete projects.
drop policy if exists "members can delete projects" on public.projects;
create policy "members can delete projects"
on public.projects for delete to authenticated
using (
  organization_id in (select public.current_user_organization_ids())
  and public.current_user_can_access_module('projects', 'manage', organization_id)
);
