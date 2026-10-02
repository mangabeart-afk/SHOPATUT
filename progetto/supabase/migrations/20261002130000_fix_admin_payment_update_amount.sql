create or replace function public.admin_update_customer_payment(
  p_payment_id uuid,
  p_payment_date date,
  p_amount_eur numeric,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment public.payments%rowtype;
  v_movement_id uuid;
  v_old_allocated numeric := 0;
  v_remaining numeric;
  v_alloc record;
  v_new_amount numeric;
begin
  if not public.is_admin() then
    raise exception 'Operazione non autorizzata';
  end if;
  if p_payment_id is null or p_amount_eur is null or p_amount_eur <= 0 then
    raise exception 'Importo pagamento non valido';
  end if;
  if p_payment_date is null then
    raise exception 'Data pagamento non valida';
  end if;

  select * into v_payment
  from public.payments
  where id = p_payment_id
  for update;

  if not found then
    raise exception 'Pagamento non trovato';
  end if;

  v_new_amount := round(p_amount_eur, 2);

  select id into v_movement_id
  from public.movements
  where reference_id = p_payment_id
    and movement_type = 'PAGAMENTO'
  order by movement_at desc
  limit 1
  for update;

  select coalesce(sum(amount_eur), 0) into v_old_allocated
  from public.payment_allocations
  where payment_id = p_payment_id;

  update public.payments
  set payment_date = p_payment_date,
      amount_eur = v_new_amount,
      notes = nullif(trim(coalesce(p_notes, '')), '')
  where id = p_payment_id;

  if v_movement_id is not null then
    update public.movements
    set mailbox_id = v_payment.mailbox_id,
        total_amount_eur = -v_new_amount,
        movement_at = p_payment_date::timestamptz,
        notes = nullif(trim(coalesce(p_notes, '')), '')
    where id = v_movement_id;
  end if;

  if v_old_allocated > v_new_amount then
    v_remaining := v_new_amount;
    for v_alloc in
      select id, amount_eur
      from public.payment_allocations
      where payment_id = p_payment_id
      order by allocated_at desc, id desc
      for update
    loop
      if v_remaining <= 0 then
        delete from public.payment_allocations where id = v_alloc.id;
      elsif v_alloc.amount_eur <= v_remaining then
        v_remaining := v_remaining - v_alloc.amount_eur;
      else
        update public.payment_allocations
        set amount_eur = v_remaining
        where id = v_alloc.id;
        v_remaining := 0;
      end if;
    end loop;
  end if;

  return p_payment_id;
end;
$$;

revoke all on function public.admin_update_customer_payment(uuid, date, numeric, text) from public, anon;
grant execute on function public.admin_update_customer_payment(uuid, date, numeric, text) to authenticated;

notify pgrst, 'reload schema';
