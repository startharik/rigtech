create policy "members can create departments"
on public.departments for insert to authenticated
with check (organization_id in (select public.current_user_organization_ids()));

create policy "members can create teams"
on public.teams for insert to authenticated
with check (organization_id in (select public.current_user_organization_ids()));

create policy "members can create clients"
on public.clients for insert to authenticated
with check (organization_id in (select public.current_user_organization_ids()));

create policy "managers can update departments"
on public.departments for update to authenticated
using (
  organization_id in (
    select om.organization_id
    from public.organization_members om
    where om.user_id = auth.uid()
      and om.role in ('admin', 'manager')
  )
)
with check (organization_id in (select public.current_user_organization_ids()));

create policy "managers can update teams"
on public.teams for update to authenticated
using (
  organization_id in (
    select om.organization_id
    from public.organization_members om
    where om.user_id = auth.uid()
      and om.role in ('admin', 'manager')
  )
)
with check (organization_id in (select public.current_user_organization_ids()));

create policy "managers can update clients"
on public.clients for update to authenticated
using (
  organization_id in (
    select om.organization_id
    from public.organization_members om
    where om.user_id = auth.uid()
      and om.role in ('admin', 'manager')
  )
)
with check (organization_id in (select public.current_user_organization_ids()));
