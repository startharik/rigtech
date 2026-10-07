alter table public.stock_movements
  add column if not exists project_id uuid;

alter table public.stock_movements
  drop constraint if exists stock_movements_project_org_fk;

alter table public.stock_movements
  add constraint stock_movements_project_org_fk
  foreign key (project_id, organization_id)
  references public.projects (id, organization_id)
  on delete set null (project_id);

create index if not exists stock_movements_project_date_idx
  on public.stock_movements (organization_id, project_id, movement_date desc)
  where project_id is not null;

drop function if exists public.record_stock_movement_with_role(
  uuid, uuid, text, numeric, date, numeric, text, text, text, text, text, numeric, text
);

create function public.record_stock_movement_with_role(
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
  p_comments text default null,
  p_project_id uuid default null
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
  if not public.current_user_can_access_module('stock', 'manage', p_organization_id) then
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
  if p_project_id is not null and not exists (
    select 1
    from public.projects p
    where p.id = p_project_id
      and p.organization_id = p_organization_id
  ) then
    raise exception 'The selected project is not available in this organization.';
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
    organization_id, stock_item_id, project_id, movement_type, quantity, ordered_quantity,
    movement_date, purchase_order, project_number, delivery_note, area, mtc,
    unit_price, comments, recorded_by
  )
  values (
    p_organization_id, p_stock_item_id, p_project_id, p_movement_type, p_quantity,
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

revoke all on function public.record_stock_movement_with_role(uuid, uuid, text, numeric, date, numeric, text, text, text, text, text, numeric, text, uuid) from public;
grant execute on function public.record_stock_movement_with_role(uuid, uuid, text, numeric, date, numeric, text, text, text, text, text, numeric, text, uuid) to authenticated;
