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
      (old.organization_id, null, auth.uid(), 'deleted', to_jsonb(old));
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
