create table if not exists public.stock_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  item_code text not null check (length(trim(item_code)) > 0),
  name text not null check (length(trim(name)) > 0),
  category text not null default '',
  description text not null default '',
  unit text not null default 'pcs' check (length(trim(unit)) > 0),
  minimum_quantity numeric(14,3) not null default 0 check (minimum_quantity >= 0),
  quantity_on_hand numeric(14,3) not null default 0 check (quantity_on_hand >= 0),
  last_unit_price numeric(14,2) check (last_unit_price is null or last_unit_price >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, item_code),
  unique (id, organization_id)
);

create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  stock_item_id uuid not null,
  movement_type text not null check (movement_type in ('receipt', 'issue')),
  quantity numeric(14,3) not null check (quantity > 0),
  ordered_quantity numeric(14,3) check (ordered_quantity is null or ordered_quantity >= 0),
  movement_date date not null default current_date,
  purchase_order text,
  project_number text,
  delivery_note text,
  area text,
  mtc text,
  unit_price numeric(14,2) check (unit_price is null or unit_price >= 0),
  comments text,
  recorded_by uuid not null default auth.uid() references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint stock_movements_item_org_fk
    foreign key (stock_item_id, organization_id)
    references public.stock_items (id, organization_id) on delete restrict
);

create index if not exists stock_items_org_name_idx
  on public.stock_items (organization_id, name);
create index if not exists stock_movements_org_date_idx
  on public.stock_movements (organization_id, movement_date desc, created_at desc);
create index if not exists stock_movements_item_date_idx
  on public.stock_movements (stock_item_id, movement_date desc);

drop trigger if exists stock_items_touch_updated_at on public.stock_items;
create trigger stock_items_touch_updated_at
before update on public.stock_items
for each row execute function public.touch_updated_at();

alter table public.stock_items enable row level security;
alter table public.stock_movements enable row level security;

create policy "internal members can view stock items"
on public.stock_items for select to authenticated
using (
  organization_id in (select public.current_user_organization_ids())
  and not exists (
    select 1 from public.organization_members om
    where om.organization_id = stock_items.organization_id
      and om.user_id = auth.uid()
      and om.role = 'client'
  )
);

create policy "managers can create stock items"
on public.stock_items for insert to authenticated
with check (public.current_user_can_manage_org(organization_id));

create policy "managers can update stock items"
on public.stock_items for update to authenticated
using (public.current_user_can_manage_org(organization_id))
with check (public.current_user_can_manage_org(organization_id));

create policy "internal members can view stock movements"
on public.stock_movements for select to authenticated
using (
  organization_id in (select public.current_user_organization_ids())
  and not exists (
    select 1 from public.organization_members om
    where om.organization_id = stock_movements.organization_id
      and om.user_id = auth.uid()
      and om.role = 'client'
  )
);

revoke all on public.stock_items, public.stock_movements from public, anon, authenticated;
grant select on public.stock_items, public.stock_movements to authenticated;
grant insert (organization_id, item_code, name, category, description, unit, minimum_quantity)
  on public.stock_items to authenticated;
grant update (item_code, name, category, description, unit, minimum_quantity)
  on public.stock_items to authenticated;

create or replace function public.record_stock_movement(
  p_organization_id uuid,
  p_stock_item_id uuid,
  p_movement_type text,
  p_quantity numeric,
  p_movement_date date,
  p_ordered_quantity numeric default null,
  p_purchase_order text default null,
  p_project_number text default null,
  p_delivery_note text default null,
  p_area text default null,
  p_mtc text default null,
  p_unit_price numeric default null,
  p_comments text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  item_quantity numeric(14,3);
  new_movement_id uuid;
begin
  if not public.current_user_can_manage_org(p_organization_id) then
    raise exception 'You do not have permission to manage stock in this organization.';
  end if;
  if p_movement_type is null or p_movement_type not in ('receipt', 'issue') then
    raise exception 'Movement type must be receipt or issue.';
  end if;
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Quantity must be greater than zero.';
  end if;
  if p_ordered_quantity is not null and p_ordered_quantity < 0 then
    raise exception 'Ordered quantity cannot be negative.';
  end if;
  if p_unit_price is not null and p_unit_price < 0 then
    raise exception 'Unit price cannot be negative.';
  end if;

  select quantity_on_hand
    into item_quantity
  from public.stock_items
  where id = p_stock_item_id and organization_id = p_organization_id
  for update;

  if not found then
    raise exception 'The selected stock item is not available in this organization.';
  end if;
  if p_movement_type = 'issue' and p_quantity > item_quantity then
    raise exception 'Insufficient stock. Available quantity: %.', item_quantity;
  end if;

  update public.stock_items
  set quantity_on_hand = item_quantity + case when p_movement_type = 'receipt' then p_quantity else -p_quantity end,
      last_unit_price = case
        when p_movement_type = 'receipt' and p_unit_price is not null then p_unit_price
        else last_unit_price
      end
  where id = p_stock_item_id and organization_id = p_organization_id;

  insert into public.stock_movements (
    organization_id, stock_item_id, movement_type, quantity, ordered_quantity,
    movement_date, purchase_order, project_number, delivery_note, area, mtc,
    unit_price, comments, recorded_by
  )
  values (
    p_organization_id, p_stock_item_id, p_movement_type, p_quantity,
    case when p_movement_type = 'receipt' then p_ordered_quantity else null end,
    coalesce(p_movement_date, current_date),
    case when p_movement_type = 'receipt' then nullif(trim(p_purchase_order), '') else null end,
    nullif(trim(p_project_number), ''),
    case when p_movement_type = 'receipt' then nullif(trim(p_delivery_note), '') else null end,
    case when p_movement_type = 'issue' then nullif(trim(p_area), '') else null end,
    case when p_movement_type = 'receipt' then nullif(trim(p_mtc), '') else null end,
    case when p_movement_type = 'receipt' then p_unit_price else null end,
    nullif(trim(p_comments), ''), auth.uid()
  )
  returning id into new_movement_id;

  return new_movement_id;
end;
$$;

revoke all on function public.record_stock_movement(uuid, uuid, text, numeric, date, numeric, text, text, text, text, text, numeric, text) from public;
grant execute on function public.record_stock_movement(uuid, uuid, text, numeric, date, numeric, text, text, text, text, text, numeric, text) to authenticated;
