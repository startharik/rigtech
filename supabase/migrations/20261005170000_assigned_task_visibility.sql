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
    select 1
    from public.tasks t
    join public.organization_members om
      on om.organization_id = t.organization_id
     and om.user_id = auth.uid()
    where t.id = target_task_id
      and public.current_user_can_access_module('tasks', target_action, t.organization_id)
      and (
        om.role in ('admin', 'manager', 'supervisor')
        or (
          om.role = 'client'
          and t.visibility = 'client_visible'
          and exists (
            select 1
            from public.client_users cu
            where cu.client_id = t.client_id
              and cu.user_id = auth.uid()
          )
        )
        or (
          om.role <> 'client'
          and (
            t.assignee_id = auth.uid()
            or exists (
              select 1
              from public.task_members tm
              where tm.task_id = t.id
                and tm.user_id = auth.uid()
            )
          )
        )
      )
  );
$$;

revoke all on function public.current_user_can_access_task_module(uuid, text) from public;
grant execute on function public.current_user_can_access_task_module(uuid, text) to authenticated;

create policy "role task assignment visibility"
on public.tasks as restrictive for select to authenticated
using (public.current_user_can_access_task_module(id, 'view'));
