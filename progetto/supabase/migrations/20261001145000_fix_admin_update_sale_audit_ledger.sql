-- Keep MODIFICA audit rows out of the financial customer balance.
CREATE OR REPLACE FUNCTION public.admin_update_customer_sale(
  p_movement_id uuid,
  p_movement_date date,
  p_quantity integer,
  p_unit_price_eur numeric,
  p_notes text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_old public.movements%ROWTYPE;
  v_article public.articles%ROWTYPE;
  v_current_assigned integer := 0;
  v_shipped integer := 0;
  v_allocated numeric := 0;
  v_new_total integer := 0;
  v_to_remove integer := 0;
  v_row public.article_assignments%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Operazione non autorizzata'; END IF;
  IF p_quantity IS NULL OR p_quantity <= 0 THEN RAISE EXCEPTION 'Quantità non valida'; END IF;
  IF p_unit_price_eur IS NULL OR p_unit_price_eur <= 0 THEN RAISE EXCEPTION 'Prezzo unitario non valido'; END IF;
  SELECT * INTO v_old FROM public.movements WHERE id=p_movement_id AND movement_type='VENDITA' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Vendita non trovata'; END IF;
  IF v_old.article_id IS NULL OR v_old.mailbox_id IS NULL THEN RAISE EXCEPTION 'Vendita non modificabile'; END IF;
  SELECT * INTO v_article FROM public.articles WHERE id=v_old.article_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Articolo non trovato'; END IF;
  SELECT COALESCE(SUM(quantity_assigned),0) INTO v_current_assigned FROM public.article_assignments WHERE article_id=v_old.article_id AND mailbox_id=v_old.mailbox_id AND status='ATTIVA';
  SELECT COALESCE(SUM(si.quantity_shipped),0) INTO v_shipped FROM public.shipment_items si JOIN public.shipments s ON s.id=si.shipment_id WHERE si.article_id=v_old.article_id AND si.mailbox_id=v_old.mailbox_id AND s.status<>'ANNULLATA';
  v_new_total := v_current_assigned - COALESCE(v_old.quantity,0) + p_quantity;
  IF v_new_total < v_shipped THEN RAISE EXCEPTION 'La quantità non può essere inferiore a quella già spedita'; END IF;
  IF v_new_total > v_article.quantity_purchased THEN RAISE EXCEPTION 'Quantità superiore a quella acquistata'; END IF;
  SELECT COALESCE(SUM(amount_eur),0) INTO v_allocated FROM public.payment_allocations WHERE movement_id=p_movement_id;
  IF p_quantity*p_unit_price_eur < v_allocated THEN RAISE EXCEPTION 'Il nuovo importo è inferiore al pagamento già attribuito (%).',v_allocated; END IF;
  UPDATE public.movements SET movement_at=COALESCE(p_movement_date,current_date)::timestamptz, quantity=p_quantity, unit_price_eur=ROUND(p_unit_price_eur,2), total_amount_eur=ROUND(p_quantity*p_unit_price_eur,2), notes=NULLIF(BTRIM(p_notes),'') WHERE id=p_movement_id;
  v_to_remove := COALESCE(v_old.quantity,0) - p_quantity;
  IF v_to_remove > 0 THEN
    FOR v_row IN SELECT * FROM public.article_assignments WHERE article_id=v_old.article_id AND mailbox_id=v_old.mailbox_id AND status='ATTIVA' ORDER BY assigned_at ASC,id ASC FOR UPDATE LOOP
      EXIT WHEN v_to_remove <= 0;
      IF v_row.quantity_assigned <= v_to_remove THEN UPDATE public.article_assignments SET quantity_assigned=0,status='ANNULLATA' WHERE id=v_row.id; v_to_remove := v_to_remove-v_row.quantity_assigned;
      ELSE UPDATE public.article_assignments SET quantity_assigned=quantity_assigned-v_to_remove WHERE id=v_row.id; v_to_remove := 0; END IF;
    END LOOP;
  ELSIF v_to_remove < 0 THEN
    SELECT * INTO v_row FROM public.article_assignments WHERE article_id=v_old.article_id AND mailbox_id=v_old.mailbox_id AND status='ATTIVA' ORDER BY assigned_at ASC,id ASC LIMIT 1 FOR UPDATE;
    IF FOUND THEN UPDATE public.article_assignments SET quantity_assigned=quantity_assigned+(-v_to_remove) WHERE id=v_row.id;
    ELSE INSERT INTO public.article_assignments(article_id,mailbox_id,quantity_assigned,status,notes) VALUES(v_old.article_id,v_old.mailbox_id,(-v_to_remove),'ATTIVA','Assegnazione da modifica vendita'); END IF;
  END IF;
  UPDATE public.articles SET status=CASE WHEN v_new_total>=quantity_purchased THEN 'VENDUTO' ELSE CASE WHEN status='IN_ARRIVO' THEN 'IN_ARRIVO' ELSE 'IN_STOCK' END END,updated_at=now() WHERE id=v_old.article_id;
  INSERT INTO public.movements(mailbox_id,movement_type,reference_id,reference_code,article_id,quantity,unit_price_eur,total_amount_eur,description,operator_user_id,notes)
  VALUES(v_old.mailbox_id,'MODIFICA',v_old.id,v_old.reference_code,v_old.article_id,p_quantity,ROUND(p_unit_price_eur,2),NULL,'Vendita articolo modificata',auth.uid(),v_old.reference_code);
END;
$$;
