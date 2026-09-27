create or replace function public.register_article_sales(
  p_customer_code text,
  p_lines jsonb,
  p_movement_date date default current_date
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_mailbox_id uuid;
  v_line jsonb;
  v_article_id uuid;
  v_qty integer;
  v_price numeric(12,2);
  v_available integer;
  v_total numeric(12,2);
  v_remaining integer;
  v_assignment_id uuid;
  v_existing integer;
begin
  if not public.is_admin() then raise exception 'Operazione non autorizzata'; end if;
  if nullif(btrim(p_customer_code), '') is null then raise exception 'Codice cliente o testo cliente obbligatorio'; end if;

  select id into v_mailbox_id from public.mailboxes
  where upper(mailbox_code)=upper(btrim(p_customer_code)) limit 1;

  if p_lines is null or jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_lines)=0 then
    raise exception 'Nessun articolo selezionato';
  end if;

  for v_line in select value from jsonb_array_elements(p_lines) loop
    v_article_id := nullif(v_line->>'article_id','')::uuid;
    v_qty := coalesce((v_line->>'quantity')::integer,0);
    v_price := coalesce((v_line->>'price')::numeric,0);
    if v_article_id is null or v_qty<=0 or v_price<=0 then raise exception 'Quantità e prezzo devono essere maggiori di zero'; end if;

    select a.quantity_purchased - coalesce((select sum(m.quantity) from public.movements m
      where m.article_id=a.id and m.movement_type='VENDITA' and coalesce(m.quantity,0)>0
        and not exists (select 1 from public.movements x where x.movement_type='ANNULLAMENTO' and x.reference_id=m.id)),0)
    into v_available from public.articles a where a.id=v_article_id and a.deleted_at is null for update;

    if v_available is null then raise exception 'Articolo non trovato o già eliminato: %',v_article_id; end if;
    if v_qty>v_available then raise exception 'Quantità non disponibile per articolo %: residua %',v_article_id,v_available; end if;
  end loop;

  for v_line in select value from jsonb_array_elements(p_lines) loop
    v_article_id := (v_line->>'article_id')::uuid;
    v_qty := (v_line->>'quantity')::integer;
    v_price := (v_line->>'price')::numeric;
    v_total := round(v_qty*v_price,2);

    if v_mailbox_id is not null then
      select id,quantity_assigned into v_assignment_id,v_existing from public.article_assignments
      where article_id=v_article_id and mailbox_id=v_mailbox_id and status='ATTIVA'
      order by assigned_at asc,id asc limit 1 for update;

      if v_assignment_id is null then
        insert into public.article_assignments(article_id,mailbox_id,quantity_assigned,status,notes)
        values(v_article_id,v_mailbox_id,v_qty,'ATTIVA','Assegnazione da vendita') returning id into v_assignment_id;
      else
        update public.article_assignments set quantity_assigned=quantity_assigned+v_qty where id=v_assignment_id;
      end if;
    end if;

    insert into public.movements(mailbox_id,movement_type,article_id,quantity,unit_price_eur,total_amount_eur,generic_customer_name,description,operator_user_id,movement_at)
    values(v_mailbox_id,'VENDITA',v_article_id,v_qty,v_price,v_total,upper(btrim(p_customer_code)),
      case when v_mailbox_id is null then 'Vendita articolo - cliente senza casella' else 'Vendita articolo' end,
      auth.uid(),p_movement_date::timestamptz);

    select a.quantity_purchased - coalesce((select sum(m.quantity) from public.movements m
      where m.article_id=a.id and m.movement_type='VENDITA'
        and not exists (select 1 from public.movements x where x.movement_type='ANNULLAMENTO' and x.reference_id=m.id)),0)
    into v_remaining from public.articles a where a.id=v_article_id;

    update public.articles set status=case when v_remaining<=0 then 'VENDUTO' when status='IN_ARRIVO' then 'IN_ARRIVO' else 'IN_STOCK' end, updated_at=now() where id=v_article_id;
  end loop;
end;
$function$;
