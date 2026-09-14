drop policy if exists "members can view tasks" on public.tasks;

create policy "members can view tasks"
on public.tasks for select to authenticated
using (
  organization_id in (select public.current_user_organization_ids())
  and (
    exists (
      select 1
      from public.organization_members om
      where om.organization_id = tasks.organization_id
        and om.user_id = auth.uid()
        and om.role = 'client'
        and tasks.visibility = 'client_visible'
        and exists (
          select 1
          from public.client_users cu
          where cu.client_id = tasks.client_id
            and cu.user_id = auth.uid()
        )
    )
    or exists (
      select 1
      from public.organization_members om
      where om.organization_id = tasks.organization_id
        and om.user_id = auth.uid()
        and om.role <> 'client'
    )
  )
);

create policy "clients can view their client links"
on public.client_users for select to authenticated
using (user_id = auth.uid());
