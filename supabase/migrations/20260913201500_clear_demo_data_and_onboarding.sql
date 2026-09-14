-- The current hosted project was seeded with the original UI demo records.
-- Keep Auth users and the organization shell, but remove all demo work data.
delete from public.tasks;
delete from public.clients;
delete from public.teams;
delete from public.departments;

create or replace function public.create_organization_for_current_user(
  organization_name text,
  organization_slug text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  new_organization_id uuid;
begin
  if current_user_id is null then
    raise exception 'Authentication is required';
  end if;

  if length(trim(organization_name)) < 2 then
    raise exception 'Organization name is required';
  end if;

  insert into public.organizations (name, slug)
  values (trim(organization_name), trim(organization_slug))
  returning id into new_organization_id;

  insert into public.organization_members (organization_id, user_id, role)
  values (new_organization_id, current_user_id, 'admin');

  return new_organization_id;
exception
  when unique_violation then
    raise exception 'That organization slug is already in use';
end;
$$;

revoke all on function public.create_organization_for_current_user(text, text) from public;
grant execute on function public.create_organization_for_current_user(text, text) to authenticated;
