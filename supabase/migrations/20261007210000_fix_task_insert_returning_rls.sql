-- INSERT ... RETURNING also evaluates SELECT policies for the returned row.
-- The task visibility helper cannot find the new row until the insert
-- statement finishes, so explicitly allow the creator to see that row.
drop policy if exists "role task assignment visibility" on public.tasks;
create policy "role task assignment visibility"
on public.tasks as restrictive for select to authenticated
using (
  created_by = auth.uid()
  or public.current_user_can_access_task_module(id, 'view')
);
