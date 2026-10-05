-- Keep the join table aligned with legacy single-assignee task records.
insert into public.task_members (task_id, user_id)
select t.id, t.assignee_id
from public.tasks t
where t.assignee_id is not null
on conflict (task_id, user_id) do nothing;

create index if not exists task_members_user_idx
  on public.task_members (user_id, task_id);
