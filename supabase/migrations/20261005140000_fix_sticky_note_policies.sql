create or replace function public.current_user_is_note_author(target_note_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.notes n
    where n.id = target_note_id
      and n.author_id = auth.uid()
  );
$$;

create or replace function public.current_user_can_view_note(target_note_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.notes n
    where n.id = target_note_id
      and n.organization_id in (select public.current_user_organization_ids())
      and (
        n.author_id = auth.uid()
        or exists (
          select 1 from public.note_shares ns
          where ns.note_id = n.id and ns.user_id = auth.uid()
        )
        or exists (
          select 1 from public.organization_members om
          where om.organization_id = n.organization_id
            and om.user_id = auth.uid()
            and om.role in ('admin', 'manager')
        )
      )
  );
$$;

revoke all on function public.current_user_is_note_author(uuid) from public;
revoke all on function public.current_user_can_view_note(uuid) from public;
grant execute on function public.current_user_is_note_author(uuid) to authenticated;
grant execute on function public.current_user_can_view_note(uuid) to authenticated;

drop policy if exists "members can view workspace notes" on public.notes;
create policy "members can view workspace notes"
on public.notes for select to authenticated
using (public.current_user_can_view_note(id));

drop policy if exists "members can view note shares" on public.note_shares;
create policy "members can view note shares"
on public.note_shares for select to authenticated
using (
  user_id = auth.uid()
  or shared_by = auth.uid()
  or public.current_user_is_note_author(note_id)
);

drop policy if exists "authors can create note shares" on public.note_shares;
create policy "authors can create note shares"
on public.note_shares for insert to authenticated
with check (
  shared_by = auth.uid()
  and public.current_user_is_note_author(note_id)
);

drop policy if exists "authors can delete note shares" on public.note_shares;
create policy "authors can delete note shares"
on public.note_shares for delete to authenticated
using (public.current_user_is_note_author(note_id));
