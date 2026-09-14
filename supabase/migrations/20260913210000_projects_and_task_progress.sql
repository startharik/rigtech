create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  description text not null default '',
  client_id uuid references public.clients(id) on delete set null,
  status text not null default 'active' check (status in ('active', 'completed', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);

alter table public.tasks add column if not exists project_id uuid references public.projects(id) on delete set null;

alter table public.projects enable row level security;

create policy "members can view projects"
on public.projects for select to authenticated
using (organization_id in (select public.current_user_organization_ids()));

create policy "members can create projects"
on public.projects for insert to authenticated
with check (organization_id in (select public.current_user_organization_ids()));

create policy "managers can update projects"
on public.projects for update to authenticated
using (
  organization_id in (
    select om.organization_id
    from public.organization_members om
    where om.user_id = auth.uid()
      and om.role in ('admin', 'manager')
  )
)
with check (organization_id in (select public.current_user_organization_ids()));

drop view if exists public.task_tree;
create view public.task_tree
with (security_invoker = true)
as
select
  t.*,
  p.full_name as assignee_name,
  c.name as client_name,
  d.name as department_name,
  pr.name as project_name
from public.tasks t
left join public.profiles p on p.id = t.assignee_id
left join public.clients c on c.id = t.client_id
left join public.departments d on d.id = t.department_id
left join public.projects pr on pr.id = t.project_id;

grant select on public.task_tree to authenticated;

create index if not exists tasks_project_idx on public.tasks (project_id);
