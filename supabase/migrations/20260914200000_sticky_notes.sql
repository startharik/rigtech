-- Workspace sticky notes and internal sharing.

create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  title text not null default '',
  body text not null default '',
  color text not null default 'yellow' check (color in ('yellow', 'blue', 'green', 'pink')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.note_shares (
  note_id uuid not null references public.notes(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  shared_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (note_id, user_id)
);

create index if not exists notes_org_updated_idx on public.notes (organization_id, updated_at desc);
create index if not exists note_shares_user_idx on public.note_shares (user_id, created_at desc);

alter table public.notes enable row level security;
alter table public.note_shares enable row level security;

create policy "members can view workspace notes"
on public.notes for select to authenticated
using (
  organization_id in (select public.current_user_organization_ids())
  and (
    author_id = auth.uid()
    or exists (select 1 from public.note_shares ns where ns.note_id = notes.id and ns.user_id = auth.uid())
    or exists (
      select 1 from public.organization_members om
      where om.organization_id = notes.organization_id
        and om.user_id = auth.uid()
        and om.role in ('admin', 'manager')
    )
  )
);

create policy "members can create workspace notes"
on public.notes for insert to authenticated
with check (
  organization_id in (select public.current_user_organization_ids())
  and author_id = auth.uid()
);

create policy "authors can update workspace notes"
on public.notes for update to authenticated
using (author_id = auth.uid())
with check (author_id = auth.uid());

create policy "authors can delete workspace notes"
on public.notes for delete to authenticated
using (author_id = auth.uid());

create policy "members can view note shares"
on public.note_shares for select to authenticated
using (
  user_id = auth.uid()
  or shared_by = auth.uid()
  or exists (select 1 from public.notes n where n.id = note_shares.note_id and n.author_id = auth.uid())
);

create policy "authors can create note shares"
on public.note_shares for insert to authenticated
with check (
  shared_by = auth.uid()
  and exists (select 1 from public.notes n where n.id = note_shares.note_id and n.author_id = auth.uid())
);

create policy "authors can delete note shares"
on public.note_shares for delete to authenticated
using (
  exists (select 1 from public.notes n where n.id = note_shares.note_id and n.author_id = auth.uid())
);

drop trigger if exists notes_touch_updated_at on public.notes;
create trigger notes_touch_updated_at
before update on public.notes
for each row execute function public.touch_updated_at();
