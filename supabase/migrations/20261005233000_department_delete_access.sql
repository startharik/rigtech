drop policy if exists "members can delete departments" on public.departments;
create policy "members can delete departments"
on public.departments for delete to authenticated
using (public.current_user_can_access_module('departments', 'manage', organization_id));

drop policy if exists "role department delete access" on public.departments;
create policy "role department delete access"
on public.departments as restrictive for delete to authenticated
using (public.current_user_can_access_module('departments', 'manage', organization_id));
