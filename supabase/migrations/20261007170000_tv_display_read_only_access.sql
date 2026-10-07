create or replace function public.current_user_is_tv_display(
  target_organization_id uuid default null
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
    join public.organization_roles r
      on r.id = om.custom_role_id
     and r.organization_id = om.organization_id
    where om.user_id = auth.uid()
      and om.role = 'employee'
      and r.name = 'TV Display'
      and (target_organization_id is null or om.organization_id = target_organization_id)
  );
$$;

revoke all on function public.current_user_is_tv_display(uuid) from public, anon;
grant execute on function public.current_user_is_tv_display(uuid) to authenticated;

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
  assigned_role_name text;
  allowed boolean;
begin
  if auth.uid() is null or target_action not in ('view', 'manage') then
    return false;
  end if;

  select om.role, r.permissions, r.name
    into member_role, assigned_permissions, assigned_role_name
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

  if member_role = 'employee' and assigned_role_name = 'TV Display' then
    return target_action = 'view'
      and target_module in ('dashboard', 'executive', 'tasks', 'projects', 'clients', 'team', 'departments');
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
          om.role = 'employee'
          and public.current_user_is_tv_display(t.organization_id)
          and target_action = 'view'
        )
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
