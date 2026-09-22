-- Fix PostgREST signature used by the admin customer form and make article sales transactional.
DROP FUNCTION IF EXISTS public.admin_create_customer_mailbox(text,text,text,text,text,date,text,text,text,text,text);
DROP FUNCTION IF EXISTS public.admin_create_customer_mailbox(text,text,text,text,text,date,text);

CREATE OR REPLACE FUNCTION public.admin_create_customer_mailbox(
  p_email text,
  p_first_name text,
  p_last_name text,
  p_notes text DEFAULT NULL,
  p_opened_at date DEFAULT CURRENT_DATE,
  p_phone text DEFAULT NULL,
  p_shipping_address text DEFAULT NULL,
  p_shipping_city text DEFAULT NULL,
  p_shipping_country text DEFAULT NULL,
  p_shipping_postal_code text DEFAULT NULL,
  p_status text DEFAULT 'ATTIVA'
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_customer_id uuid; v_mailbox_id uuid; v_mailbox_code text;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Operazione non autorizzata'; END IF;
  IF btrim(coalesce(p_first_name,''))='' OR btrim(coalesce(p_last_name,''))='' THEN RAISE EXCEPTION 'Nome e cognome sono obbligatori'; END IF;
  IF p_status NOT IN ('ATTIVA','SOSPESA','CHIUSA') THEN RAISE EXCEPTION 'Stato casella non valido'; END IF;
  INSERT INTO public.customers(first_name,last_name,phone,email,shipping_address,shipping_city,shipping_postal_code,shipping_country)
  VALUES(btrim(p_first_name),btrim(p_last_name),nullif(btrim(p_phone),''),nullif(btrim(p_email),''),nullif(btrim(p_shipping_address),''),nullif(btrim(p_shipping_city),''),nullif(btrim(p_shipping_postal_code),''),nullif(btrim(p_shipping_country),''))
  RETURNING id INTO v_customer_id;
  INSERT INTO public.mailboxes(customer_id,status,opened_at,notes)
  VALUES(v_customer_id,p_status,p_opened_at,nullif(btrim(p_notes),''))
  RETURNING id,mailbox_code INTO v_mailbox_id,v_mailbox_code;
  RETURN jsonb_build_object('customer_id',v_customer_id,'mailbox_id',v_mailbox_id,'mailbox_code',v_mailbox_code);
END; $$;
GRANT EXECUTE ON FUNCTION public.admin_create_customer_mailbox(text,text,text,text,date,text,text,text,text,text,text) TO authenticated;

DROP FUNCTION IF EXISTS public.register_article_sales(text,jsonb);
CREATE OR REPLACE FUNCTION public.register_article_sales(p_customer_code text,p_lines jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_mailbox_id uuid; v_line jsonb; v_article_id uuid; v_qty integer; v_price numeric;
  v_available integer; v_total numeric; v_remaining integer; v_existing integer;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Operazione non autorizzata'; END IF;
  SELECT id INTO v_mailbox_id FROM public.mailboxes WHERE upper(mailbox_code)=upper(btrim(p_customer_code));
  IF v_mailbox_id IS NULL THEN RAISE EXCEPTION 'Codice casella non trovato: %', p_customer_code; END IF;
  IF p_lines IS NULL OR jsonb_array_length(p_lines)=0 THEN RAISE EXCEPTION 'Nessun articolo selezionato'; END IF;
  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    v_article_id := (v_line->>'article_id')::uuid;
    v_qty := (v_line->>'quantity')::integer;
    v_price := (v_line->>'price')::numeric;
    IF v_qty <= 0 OR v_price <= 0 THEN RAISE EXCEPTION 'Quantità e prezzo devono essere maggiori di zero'; END IF;
    SELECT a.quantity_purchased - coalesce((SELECT sum(m.quantity) FROM public.movements m WHERE m.article_id=a.id AND m.movement_type='VENDITA'),0)
    INTO v_available FROM public.articles a WHERE a.id=v_article_id FOR UPDATE;
    IF v_available IS NULL THEN RAISE EXCEPTION 'Articolo non trovato: %', v_article_id; END IF;
    IF v_qty > v_available THEN RAISE EXCEPTION 'Quantità non disponibile per articolo %: residua %', v_article_id, v_available; END IF;
    v_total := v_qty*v_price;
    INSERT INTO public.movements(mailbox_id,movement_type,article_id,quantity,unit_price_eur,total_amount_eur,generic_customer_name,description,operator_user_id)
    VALUES(v_mailbox_id,'VENDITA',v_article_id,v_qty,v_price,v_total,p_customer_code,'Vendita articolo',auth.uid());
    SELECT coalesce(sum(aa.quantity_assigned),0) INTO v_existing
    FROM public.article_assignments aa WHERE aa.article_id=v_article_id AND aa.mailbox_id=v_mailbox_id AND aa.status='ATTIVA';
    IF v_existing = 0 THEN
      INSERT INTO public.article_assignments(article_id,mailbox_id,quantity_assigned,status,notes)
      VALUES(v_article_id,v_mailbox_id,v_qty,'ATTIVA','Assegnazione da vendita');
    ELSE
      UPDATE public.article_assignments aa SET quantity_assigned=quantity_assigned+v_qty
      WHERE aa.id=(SELECT id FROM public.article_assignments WHERE article_id=v_article_id AND mailbox_id=v_mailbox_id AND status='ATTIVA' ORDER BY assigned_at ASC,id ASC LIMIT 1);
    END IF;
    v_remaining := v_available-v_qty;
    UPDATE public.articles SET status=CASE WHEN v_remaining<=0 THEN 'VENDUTO' WHEN status='IN_ARRIVO' THEN 'IN_ARRIVO' ELSE 'IN_STOCK' END, updated_at=now() WHERE id=v_article_id;
  END LOOP;
END; $$;
GRANT EXECUTE ON FUNCTION public.register_article_sales(text,jsonb) TO authenticated;
NOTIFY pgrst, 'reload schema';
