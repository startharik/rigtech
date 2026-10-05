drop policy if exists "members can delete tasks" on public.tasks;
create policy "members can delete tasks"
on public.tasks for delete to authenticated
using (
  organization_id in (select public.current_user_organization_ids())
  and public.current_user_can_access_module('tasks', 'manage', organization_id)
);
