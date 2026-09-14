create extension if not exists "pgcrypto";
create type public.user_role as enum ('admin', 'manager', 'employee');
create type public.department as enum ('engineering', 'fabrication', 'maintenance', 'procurement', 'qa_qc', 'management');
create type public.task_priority as enum ('low', 'medium', 'high', 'urgent');
create type public.task_status as enum ('to_do', 'in_progress', 'waiting', 'completed');
create type public.notification_type as enum ('task_assigned', 'task_due_today', 'task_overdue', 'task_completed', 'comment_added', 'task_created', 'priority_changed', 'status_changed');
create type public.activity_type as enum ('task_created', 'task_assigned', 'priority_changed', 'status_changed', 'comment_added', 'task_completed', 'task_updated', 'due_date_changed');
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  email text not null,
  avatar_url text,
  department public.department not null default 'engineering',
  role public.user_role not null default 'employee',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.tags (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  color text not null default '#71717A',
  created_at timestamptz not null default now()
);
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  created_by_user_id uuid not null references public.profiles(id),
  assigned_to_user_id uuid references public.profiles(id),
  department public.department not null,
  priority public.task_priority not null default 'medium',
  status public.task_status not null default 'to_do',
  due_date timestamptz,
  completed_by_user_id uuid references public.profiles(id),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.task_tags (
  task_id uuid not null references public.tasks(id) on delete cascade,
  tag_id uuid not null references public.tags(id) on delete cascade,
  primary key (task_id, tag_id)
);
create table public.comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  user_id uuid not null references public.profiles(id),
  content text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
create table public.activities (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  user_id uuid not null references public.profiles(id),
  type public.activity_type not null,
  description text not null,
  old_value text,
  new_value text,
  created_at timestamptz not null default now()
);
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type public.notification_type not null,
  title text not null,
  message text not null,
  task_id uuid references public.tasks(id) on delete cascade,
  related_user_id uuid references public.profiles(id),
  is_read boolean not null default false,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    new.email
  );
  return new;
end;
$$;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
alter table public.profiles enable row level security;
alter table public.tags enable row level security;
alter table public.tasks enable row level security;
alter table public.task_tags enable row level security;
alter table public.comments enable row level security;
alter table public.activities enable row level security;
alter table public.notifications enable row level security;
create policy "Authenticated users can read profiles" on public.profiles for select to authenticated using (true);
create policy "Users can update their profile" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy "Authenticated users can read tags" on public.tags for select to authenticated using (true);
create policy "Authenticated users can create tags" on public.tags for insert to authenticated with check (true);
create policy "Users can read visible tasks" on public.tasks for select to authenticated using (
  created_by_user_id = auth.uid() or assigned_to_user_id = auth.uid()
  or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'manager'))
);
create policy "Authenticated users can create tasks" on public.tasks for insert to authenticated with check (created_by_user_id = auth.uid());
create policy "Users can update visible tasks" on public.tasks for update to authenticated using (
  created_by_user_id = auth.uid() or assigned_to_user_id = auth.uid()
  or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'manager'))
);
create policy "Authenticated users can read task tags" on public.task_tags for select to authenticated using (
  exists (select 1 from public.tasks t where t.id = task_id)
);
create policy "Authenticated users can manage task tags" on public.task_tags for all to authenticated using (
  exists (select 1 from public.tasks t where t.id = task_id and (t.created_by_user_id = auth.uid() or t.assigned_to_user_id = auth.uid()))
) with check (
  exists (select 1 from public.tasks t where t.id = task_id and (t.created_by_user_id = auth.uid() or t.assigned_to_user_id = auth.uid()))
);
create policy "Users can read task comments" on public.comments for select to authenticated using (
  exists (select 1 from public.tasks t where t.id = task_id)
);
create policy "Authenticated users can create comments" on public.comments for insert to authenticated with check (user_id = auth.uid());
create policy "Users can read task activity" on public.activities for select to authenticated using (
  exists (select 1 from public.tasks t where t.id = task_id)
);
create policy "Authenticated users can create activity" on public.activities for insert to authenticated with check (user_id = auth.uid());
create policy "Users can read their notifications" on public.notifications for select to authenticated using (user_id = auth.uid());
create policy "Users can update their notifications" on public.notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "Authenticated users can create notifications" on public.notifications for insert to authenticated with check (true);
create index tasks_assigned_to_user_idx on public.tasks(assigned_to_user_id);
create index tasks_created_by_user_idx on public.tasks(created_by_user_id);
create index tasks_status_idx on public.tasks(status);
create index notifications_user_idx on public.notifications(user_id, created_at desc);
