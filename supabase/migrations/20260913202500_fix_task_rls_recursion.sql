-- Avoid circular RLS evaluation:
-- tasks -> task_members -> tasks.
-- Organization membership and direct task ownership are sufficient for the
-- initial task query. Collaboration visibility can be added later through a
-- security-definer helper without nesting RLS policies.

drop policy if exists "members can view tasks" on public.tasks;

create policy "members can view tasks"
on public.tasks for select to authenticated
using (
  organization_id in (select public.current_user_organization_ids())
  and (
    visibility = 'internal'
    or assignee_id = auth.uid()
    or created_by = auth.uid()
    or exists (
      select 1
      from public.organization_members om
      where om.organization_id = tasks.organization_id
        and om.user_id = auth.uid()
        and om.role in ('admin', 'manager', 'supervisor')
    )
  )
);

drop policy if exists "members can manage task members" on public.task_members;

create policy "members can manage task members"
on public.task_members for all to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1
    from public.organization_members om
    join public.tasks t on t.organization_id = om.organization_id
    where t.id = task_members.task_id
      and om.user_id = auth.uid()
      and om.role in ('admin', 'manager', 'supervisor')
  )
)
with check (
  exists (
    select 1
    from public.organization_members om
    join public.tasks t on t.organization_id = om.organization_id
    where t.id = task_members.task_id
      and om.user_id = auth.uid()
  )
);
