-- Unico identificativo pubblico: mailbox_code.
DROP TRIGGER IF EXISTS trg_set_customer_code ON public.customers;
DROP INDEX IF EXISTS public.customers_customer_code_unique;
DROP FUNCTION IF EXISTS public.set_customer_code();
DROP FUNCTION IF EXISTS public.make_customer_code(text, uuid);
ALTER TABLE public.customers DROP COLUMN IF EXISTS customer_code;

-- Compatibilità con il frontend: la registrazione vendita usa il codice casella.
CREATE OR REPLACE FUNCTION public.register_article_sales(p_mailbox_code text, p_lines jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
declare v_mailbox_id uuid; v_line jsonb; v_article_id uuid; v_qty integer; v_price numeric; v_available integer; v_total numeric;
begin
  if not public.is_admin() then raise exception 'Operazione non autorizzata'; end if;
  select id into v_mailbox_id from public.mailboxes where upper(mailbox_code)=upper(btrim(p_mailbox_code));
  if v_mailbox_id is null then raise exception 'Codice casella non trovato: %', p_mailbox_code; end if;
  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_article_id := (v_line->>'article_id')::uuid; v_qty := greatest(0,(v_line->>'quantity')::integer); v_price := greatest(0,(v_line->>'price')::numeric);
    select quantity_purchased - coalesce((select sum(quantity) from public.movements where article_id=a.id and movement_type='VENDITA'),0) into v_available from public.articles a where a.id=v_article_id;
    if v_available is null or v_qty <= 0 or v_qty > v_available then raise exception 'Quantità non disponibile per articolo %', v_article_id; end if;
    v_total := v_qty*v_price;
    insert into public.movements(mailbox_id,movement_type,article_id,quantity,unit_price_eur,total_amount_eur,generic_customer_name,description,operator_user_id)
    values(v_mailbox_id,'VENDITA',v_article_id,v_qty,v_price,v_total,p_mailbox_code,'Vendita articolo',auth.uid());
  end loop;
end; $$;
GRANT EXECUTE ON FUNCTION public.register_article_sales(text,jsonb) TO authenticated;
