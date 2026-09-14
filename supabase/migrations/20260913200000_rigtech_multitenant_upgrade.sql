create extension if not exists "pgcrypto";

do $$
begin
  if not exists (select 1 from pg_type where typname = 'member_role') then
    create type public.member_role as enum ('admin', 'manager', 'supervisor', 'employee', 'client');
  end if;
  if not exists (select 1 from pg_type where typname = 'task_visibility') then
    create type public.task_visibility as enum ('internal', 'client_visible');
  end if;
end
$$;

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now()
);

alter table public.profiles add column if not exists full_name text;
alter table public.profiles add column if not exists phone text;
update public.profiles set full_name = coalesce(full_name, name, split_part(email, '@', 1));

create table if not exists public.departments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (organization_id, name)
);

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  department_id uuid references public.departments(id) on delete set null,
  name text not null,
  created_at timestamptz not null default now(),
  unique (organization_id, name)
);

create table if not exists public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.member_role not null default 'employee',
  department_id uuid references public.departments(id) on delete set null,
  team_id uuid references public.teams(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  contact_email text,
  created_at timestamptz not null default now()
);

create table if not exists public.client_users (
  client_id uuid not null references public.clients(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (client_id, user_id)
);

insert into public.organizations (name, slug)
values ('RIGTECH ENGINEERING', 'rigtech-engineering')
on conflict (slug) do nothing;

insert into public.organization_members (organization_id, user_id, role)
select
  o.id,
  p.id,
  case p.role::text
    when 'admin' then 'admin'::public.member_role
    when 'manager' then 'manager'::public.member_role
    else 'employee'::public.member_role
  end
from public.organizations o
cross join public.profiles p
where o.slug = 'rigtech-engineering'
on conflict (organization_id, user_id) do nothing;

alter table public.tasks add column if not exists organization_id uuid;
alter table public.tasks add column if not exists parent_task_id uuid references public.tasks(id) on delete cascade;
alter table public.tasks add column if not exists created_by uuid;
alter table public.tasks add column if not exists assignee_id uuid;
alter table public.tasks add column if not exists department_id uuid references public.departments(id) on delete set null;
alter table public.tasks add column if not exists team_id uuid references public.teams(id) on delete set null;
alter table public.tasks add column if not exists client_id uuid references public.clients(id) on delete set null;
alter table public.tasks add column if not exists visibility public.task_visibility default 'internal';
alter table public.tasks add column if not exists tags text[] not null default '{}';
alter table public.tasks add column if not exists metadata jsonb not null default '{}'::jsonb;

update public.tasks
set
  organization_id = coalesce(organization_id, (select id from public.organizations where slug = 'rigtech-engineering')),
  created_by = coalesce(created_by, created_by_user_id),
  assignee_id = coalesce(assignee_id, assigned_to_user_id),
  visibility = coalesce(visibility, 'internal'::public.task_visibility);

alter table public.tasks alter column organization_id set not null;
alter table public.tasks alter column created_by set not null;
alter table public.tasks alter column visibility set not null;
alter table public.tasks
  add constraint tasks_organization_fk foreign key (organization_id) references public.organizations(id) on delete cascade,
  add constraint tasks_created_by_fk foreign key (created_by) references public.profiles(id) on delete restrict,
  add constraint tasks_assignee_fk foreign key (assignee_id) references public.profiles(id) on delete set null;

create table if not exists public.task_members (
  task_id uuid not null references public.tasks(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (task_id, user_id)
);

create table if not exists public.attachments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  uploaded_by uuid not null references public.profiles(id) on delete restrict,
  storage_path text not null,
  file_name text not null,
  mime_type text,
  created_at timestamptz not null default now()
);

alter table public.comments add column if not exists author_id uuid;
alter table public.comments add column if not exists body text;
alter table public.comments add column if not exists client_visible boolean not null default false;
update public.comments
set author_id = coalesce(author_id, user_id), body = coalesce(body, content);

create or replace function public.current_user_organization_ids()
returns setof uuid
language sql stable security definer
set search_path = public
as $$
  select organization_id from public.organization_members where user_id = auth.uid();
$$;

create or replace function public.touch_updated_at()
returns trigger language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
before update on public.profiles
for each row execute function public.touch_updated_at();

drop trigger if exists tasks_touch_updated_at on public.tasks;
create trigger tasks_touch_updated_at
before update on public.tasks
for each row execute function public.touch_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name, full_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', new.raw_user_meta_data ->> 'full_name', split_part(coalesce(new.email, 'New user'), '@', 1)),
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', split_part(coalesce(new.email, 'New user'), '@', 1)),
    new.email
  )
  on conflict (id) do update set email = excluded.email, updated_at = now();
  return new;
end;
$$;

drop view if exists public.task_tree;
create view public.task_tree
with (security_invoker = true)
as
select
  t.*,
  p.full_name as assignee_name,
  c.name as client_name,
  d.name as department_name
from public.tasks t
left join public.profiles p on p.id = t.assignee_id
left join public.clients c on c.id = t.client_id
left join public.departments d on d.id = t.department_id;

grant select on public.task_tree to authenticated;

alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.organization_members enable row level security;
alter table public.departments enable row level security;
alter table public.teams enable row level security;
alter table public.clients enable row level security;
alter table public.client_users enable row level security;
alter table public.tasks enable row level security;
alter table public.task_members enable row level security;
alter table public.comments enable row level security;
alter table public.attachments enable row level security;

drop policy if exists "Users can read visible tasks" on public.tasks;
drop policy if exists "Authenticated users can create tasks" on public.tasks;
drop policy if exists "Users can update visible tasks" on public.tasks;

create policy "members can view organizations"
on public.organizations for select to authenticated
using (id in (select public.current_user_organization_ids()));

create policy "members can view memberships"
on public.organization_members for select to authenticated
using (organization_id in (select public.current_user_organization_ids()));

create policy "members can view departments"
on public.departments for select to authenticated
using (organization_id in (select public.current_user_organization_ids()));

create policy "members can view teams"
on public.teams for select to authenticated
using (organization_id in (select public.current_user_organization_ids()));

create policy "members can view clients"
on public.clients for select to authenticated
using (organization_id in (select public.current_user_organization_ids()));

create policy "members can view tasks"
on public.tasks for select to authenticated
using (
  organization_id in (select public.current_user_organization_ids())
  and (
    visibility = 'internal'
    or assignee_id = auth.uid()
    or exists (select 1 from public.task_members tm where tm.task_id = tasks.id and tm.user_id = auth.uid())
    or exists (select 1 from public.organization_members om where om.organization_id = tasks.organization_id and om.user_id = auth.uid() and om.role in ('admin', 'manager', 'supervisor'))
  )
);

create policy "members can create tasks"
on public.tasks for insert to authenticated
with check (
  organization_id in (select public.current_user_organization_ids())
  and created_by = auth.uid()
);

create policy "members can update tasks"
on public.tasks for update to authenticated
using (
  organization_id in (select public.current_user_organization_ids())
  and (created_by = auth.uid() or assignee_id = auth.uid() or exists (
    select 1 from public.organization_members om
    where om.organization_id = tasks.organization_id and om.user_id = auth.uid() and om.role in ('admin', 'manager', 'supervisor')
  ))
)
with check (organization_id in (select public.current_user_organization_ids()));

create policy "members can view task members"
on public.task_members for select to authenticated
using (task_id in (select id from public.tasks where organization_id in (select public.current_user_organization_ids())));

create policy "members can manage task members"
on public.task_members for all to authenticated
using (task_id in (select id from public.tasks where organization_id in (select public.current_user_organization_ids())))
with check (task_id in (select id from public.tasks where organization_id in (select public.current_user_organization_ids())));

create policy "members can view attachments"
on public.attachments for select to authenticated
using (task_id in (select id from public.tasks where organization_id in (select public.current_user_organization_ids())));

create policy "members can create attachments"
on public.attachments for insert to authenticated
with check (uploaded_by = auth.uid() and task_id in (select id from public.tasks where organization_id in (select public.current_user_organization_ids())));

create index if not exists tasks_org_parent_idx on public.tasks (organization_id, parent_task_id);
create index if not exists tasks_org_assignee_idx on public.tasks (organization_id, assignee_id);
create index if not exists tasks_org_due_date_idx on public.tasks (organization_id, due_date);
