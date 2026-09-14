-- Internal production support: organization settings, directory assignments,
-- capacity, workload controls, audit history, notifications, and milestones.

alter table public.organizations
  add column if not exists logo_url text,
  add column if not exists website text,
  add column if not exists timezone text not null default 'UTC',
  add column if not exists settings jsonb not null default '{}'::jsonb,
  add column if not exists updated_at timestamptz not null default now();

alter table public.organization_members
  add column if not exists availability_status text not null default 'available'
    check (availability_status in ('available', 'limited', 'unavailable', 'leave')),
  add column if not exists capacity_hours_per_week numeric(6,2) not null default 40
    check (capacity_hours_per_week >= 0 and capacity_hours_per_week <= 168),
  add column if not exists max_active_tasks integer not null default 10
    check (max_active_tasks >= 0),
  add column if not exists workload_notes text;

create table if not exists public.member_availability (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'available'
    check (status in ('available', 'limited', 'unavailable', 'leave')),
  available_from date,
  available_until date,
  capacity_hours_per_week numeric(6,2) not null default 40
    check (capacity_hours_per_week >= 0 and capacity_hours_per_week <= 168),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (available_until is null or available_from is null or available_until >= available_from),
  unique (organization_id, user_id, available_from)
);

create table if not exists public.employee_workload_limits (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  max_active_tasks integer not null default 10 check (max_active_tasks >= 0),
  max_hours_per_week numeric(6,2) not null default 40
    check (max_hours_per_week >= 0 and max_hours_per_week <= 168),
  warning_threshold_percent numeric(5,2) not null default 80
    check (warning_threshold_percent between 0 and 100),
  enforced boolean not null default true,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create table if not exists public.notification_preferences (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  task_assigned boolean not null default true,
  task_due boolean not null default true,
  task_overdue boolean not null default true,
  task_completed boolean not null default true,
  comments boolean not null default true,
  project_updates boolean not null default true,
  email_enabled boolean not null default true,
  in_app_enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

alter table public.projects
  add column if not exists start_date date,
  add column if not exists target_date date,
  add column if not exists completed_at timestamptz,
  add column if not exists updated_by uuid references public.profiles(id) on delete set null;

create table if not exists public.project_milestones (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null,
  description text not null default '',
  due_date date,
  completed_at timestamptz,
  completed_by uuid references public.profiles(id) on delete set null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, name)
);

create table if not exists public.task_audit_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete set null,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null check (action in ('created', 'updated', 'deleted')),
  changed_fields text[] not null default '{}',
  old_record jsonb,
  new_record jsonb,
  created_at timestamptz not null default now()
);

create index if not exists member_availability_org_user_idx
  on public.member_availability (organization_id, user_id, available_from);
create index if not exists workload_limits_org_user_idx
  on public.employee_workload_limits (organization_id, user_id);
create index if not exists project_milestones_project_due_idx
  on public.project_milestones (project_id, due_date);
create index if not exists task_audit_events_org_task_created_idx
  on public.task_audit_events (organization_id, task_id, created_at desc);

create or replace function public.audit_task_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  changed text[];
begin
  if tg_op = 'INSERT' then
    insert into public.task_audit_events
      (organization_id, task_id, actor_id, action, new_record)
    values
      (new.organization_id, new.id, auth.uid(), 'created', to_jsonb(new));
    return new;
  elsif tg_op = 'DELETE' then
    insert into public.task_audit_events
      (organization_id, task_id, actor_id, action, old_record)
    values
      (old.organization_id, old.id, auth.uid(), 'deleted', to_jsonb(old));
    return old;
  end if;

  select coalesce(array_agg(key order by key), '{}')
    into changed
  from jsonb_object_keys(to_jsonb(new)) as key
  where to_jsonb(new) -> key is distinct from to_jsonb(old) -> key;

  insert into public.task_audit_events
    (organization_id, task_id, actor_id, action, changed_fields, old_record, new_record)
  values
    (new.organization_id, new.id, auth.uid(), 'updated', changed, to_jsonb(old), to_jsonb(new));
  return new;
end;
$$;

drop trigger if exists tasks_audit_changes on public.tasks;
create trigger tasks_audit_changes
after insert or update or delete on public.tasks
for each row execute function public.audit_task_changes();

drop trigger if exists organizations_touch_updated_at on public.organizations;
create trigger organizations_touch_updated_at
before update on public.organizations
for each row execute function public.touch_updated_at();

drop trigger if exists member_availability_touch_updated_at on public.member_availability;
create trigger member_availability_touch_updated_at
before update on public.member_availability
for each row execute function public.touch_updated_at();

drop trigger if exists workload_limits_touch_updated_at on public.employee_workload_limits;
create trigger workload_limits_touch_updated_at
before update on public.employee_workload_limits
for each row execute function public.touch_updated_at();

drop trigger if exists notification_preferences_touch_updated_at on public.notification_preferences;
create trigger notification_preferences_touch_updated_at
before update on public.notification_preferences
for each row execute function public.touch_updated_at();

drop trigger if exists project_milestones_touch_updated_at on public.project_milestones;
create trigger project_milestones_touch_updated_at
before update on public.project_milestones
for each row execute function public.touch_updated_at();

create or replace function public.current_user_can_manage_org(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members om
    where om.organization_id = target_organization_id
      and om.user_id = auth.uid()
      and om.role in ('admin', 'manager', 'supervisor')
  );
$$;

revoke all on function public.current_user_can_manage_org(uuid) from public;
grant execute on function public.current_user_can_manage_org(uuid) to authenticated;

alter table public.member_availability enable row level security;
alter table public.employee_workload_limits enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.project_milestones enable row level security;
alter table public.task_audit_events enable row level security;

create policy "members can view availability"
on public.member_availability for select to authenticated
using (organization_id in (select public.current_user_organization_ids()));

create policy "members can manage own availability"
on public.member_availability for all to authenticated
using (user_id = auth.uid() or public.current_user_can_manage_org(organization_id))
with check (organization_id in (select public.current_user_organization_ids())
  and (user_id = auth.uid() or public.current_user_can_manage_org(organization_id)));

create policy "members can view workload limits"
on public.employee_workload_limits for select to authenticated
using (organization_id in (select public.current_user_organization_ids()));

create policy "managers can manage workload limits"
on public.employee_workload_limits for all to authenticated
using (public.current_user_can_manage_org(organization_id))
with check (public.current_user_can_manage_org(organization_id));

create policy "members can view own notification preferences"
on public.notification_preferences for select to authenticated
using (user_id = auth.uid()
  and organization_id in (select public.current_user_organization_ids()));

create policy "members can manage own notification preferences"
on public.notification_preferences for all to authenticated
using (user_id = auth.uid()
  and organization_id in (select public.current_user_organization_ids()))
with check (user_id = auth.uid()
  and organization_id in (select public.current_user_organization_ids()));

create policy "members can view project milestones"
on public.project_milestones for select to authenticated
using (organization_id in (select public.current_user_organization_ids()));

create policy "managers can manage project milestones"
on public.project_milestones for all to authenticated
using (public.current_user_can_manage_org(organization_id))
with check (organization_id in (select public.current_user_organization_ids()));

create policy "members can view task audit history"
on public.task_audit_events for select to authenticated
using (organization_id in (select public.current_user_organization_ids()));

drop policy if exists "managers can update organization settings" on public.organizations;
create policy "managers can update organization settings"
on public.organizations for update to authenticated
using (public.current_user_can_manage_org(id))
with check (id in (select public.current_user_organization_ids()));

create policy "managers can update member assignments"
on public.organization_members for update to authenticated
using (public.current_user_can_manage_org(organization_id))
with check (public.current_user_can_manage_org(organization_id)
  and organization_id in (select public.current_user_organization_ids()));
