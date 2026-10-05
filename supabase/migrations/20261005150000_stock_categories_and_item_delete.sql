create table if not exists public.stock_categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (
    length(trim(name)) between 1 and 100
    and name = trim(name)
  ),
  created_at timestamptz not null default now(),
  unique (organization_id, name)
);

create unique index if not exists stock_categories_org_lower_name_idx
  on public.stock_categories (organization_id, lower(name));
create index if not exists stock_categories_org_name_idx
  on public.stock_categories (organization_id, name);

insert into public.stock_categories (organization_id, name)
select organization_id, min(trim(category))
from public.stock_items
where trim(category) <> ''
group by organization_id, lower(trim(category))
on conflict do nothing;

alter table public.stock_categories enable row level security;

create policy "internal members can view stock categories"
on public.stock_categories for select to authenticated
using (
  organization_id in (select public.current_user_organization_ids())
  and not exists (
    select 1 from public.organization_members om
    where om.organization_id = stock_categories.organization_id
      and om.user_id = auth.uid()
      and om.role = 'client'
  )
);

create policy "managers can create stock categories"
on public.stock_categories for insert to authenticated
with check (public.current_user_can_manage_org(organization_id));

revoke all on public.stock_categories from public, anon, authenticated;
grant select on public.stock_categories to authenticated;
grant insert (organization_id, name) on public.stock_categories to authenticated;

create or replace function public.delete_stock_item(
  p_organization_id uuid,
  p_stock_item_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  item_quantity numeric(14,3);
begin
  if not public.current_user_can_manage_org(p_organization_id) then
    raise exception 'You do not have permission to manage stock in this organization.';
  end if;

  select quantity_on_hand
    into item_quantity
  from public.stock_items
  where id = p_stock_item_id and organization_id = p_organization_id
  for update;

  if not found then
    raise exception 'The selected stock item is not available in this organization.';
  end if;
  if item_quantity <> 0 then
    raise exception 'This item still has % units in stock. Record issues until the balance is zero before deleting it.', item_quantity;
  end if;
  if exists (
    select 1 from public.stock_movements
    where stock_item_id = p_stock_item_id
      and organization_id = p_organization_id
  ) then
    raise exception 'This item has movement history and cannot be deleted, so the inventory ledger remains intact.';
  end if;

  delete from public.stock_items
  where id = p_stock_item_id and organization_id = p_organization_id;
end;
$$;

revoke all on function public.delete_stock_item(uuid, uuid) from public;
grant execute on function public.delete_stock_item(uuid, uuid) to authenticated;
