-- Admin editing from customer sheet: purchased article sales, payments and credits.
-- All changes are atomic and create a MODIFICA audit movement with before/after snapshots.

CREATE OR REPLACE FUNCTION public.admin_update_customer_sale(
  p_movement_id uuid,
  p_movement_date date,
  p_quantity integer,
  p_unit_price_eur numeric,
  p_notes text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_old public.movements%ROWTYPE;
  v_assignment public.article_assignments%ROWTYPE;
  v_article public.articles%ROWTYPE;
  v_allocated numeric := 0;
  v_current_assigned integer := 0;
  v_new_total integer;
  v_shipped integer := 0;
  v_before jsonb;
  v_after jsonb;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Operazione non autorizzata'; END IF;
  IF p_quantity IS NULL OR p_quantity <= 0 THEN RAISE EXCEPTION 'Quantità non valida'; END IF;
  IF p_unit_price_eur IS NULL OR p_unit_price_eur <= 0 THEN RAISE EXCEPTION 'Prezzo unitario non valido'; END IF;

  SELECT * INTO v_old FROM public.movements WHERE id=p_movement_id AND movement_type='VENDITA' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Vendita non trovata'; END IF;
  IF v_old.article_id IS NULL OR v_old.mailbox_id IS NULL THEN RAISE EXCEPTION 'Vendita non modificabile'; END IF;

  SELECT * INTO v_article FROM public.articles WHERE id=v_old.article_id FOR UPDATE;
  SELECT * INTO v_assignment
  FROM public.article_assignments
  WHERE article_id=v_old.article_id AND mailbox_id=v_old.mailbox_id AND status='ATTIVA'
  ORDER BY assigned_at ASC,id ASC LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Assegnazione attiva non trovata'; END IF;

  SELECT coalesce(sum(quantity_assigned),0) INTO v_current_assigned
  FROM public.article_assignments
  WHERE article_id=v_old.article_id AND mailbox_id=v_old.mailbox_id AND status='ATTIVA';

  SELECT coalesce(sum(si.quantity_shipped),0) INTO v_shipped
  FROM public.shipment_items si
  JOIN public.shipments s ON s.id=si.shipment_id
  WHERE si.article_id=v_old.article_id AND si.mailbox_id=v_old.mailbox_id AND s.status<>'ANNULLATA';

  IF v_current_assigned - v_old.quantity + p_quantity < v_shipped THEN
    RAISE EXCEPTION 'La quantità non può essere inferiore a quella già spedita';
  END IF;
  v_new_total := v_current_assigned - v_old.quantity + p_quantity;
  IF v_new_total > v_article.quantity_purchased THEN
    RAISE EXCEPTION 'Quantità superiore a quella acquistata';
  END IF;

  SELECT coalesce(sum(pa.amount_eur),0) INTO v_allocated
  FROM public.payment_allocations pa WHERE pa.movement_id=p_movement_id;
  IF p_quantity*p_unit_price_eur < v_allocated THEN
    RAISE EXCEPTION 'Il nuovo importo è inferiore al pagamento già attribuito ( %)', v_allocated;
  END IF;

  v_before := jsonb_build_object('date',v_old.movement_at::date,'quantity',v_old.quantity,'unit_price_eur',v_old.unit_price_eur,'total_amount_eur',v_old.total_amount_eur,'notes',v_old.notes);

  UPDATE public.movements
  SET movement_at=coalesce(p_movement_date,current_date)::timestamptz,
      quantity=p_quantity,
      unit_price_eur=round(p_unit_price_eur,2),
      total_amount_eur=round(p_quantity*p_unit_price_eur,2),
      notes=nullif(btrim(p_notes),'')
  WHERE id=p_movement_id;

  UPDATE public.article_assignments
  SET quantity_assigned=quantity_assigned-v_old.quantity+p_quantity,
      notes=nullif(btrim(p_notes),'')
  WHERE id=v_assignment.id;

  UPDATE public.articles
  SET status=CASE WHEN v_new_total >= quantity_purchased THEN 'VENDUTO' ELSE CASE WHEN status='IN_ARRIVO' THEN 'IN_ARRIVO' ELSE 'IN_STOCK' END END,
      updated_at=now()
  WHERE id=v_old.article_id;

  SELECT jsonb_build_object('date',movement_at::date,'quantity',quantity,'unit_price_eur',unit_price_eur,'total_amount_eur',total_amount_eur,'notes',notes) INTO v_after
  FROM public.movements WHERE id=p_movement_id;

  UPDATE public.movements SET change_before=v_before, change_after=v_after WHERE id=p_movement_id;

  INSERT INTO public.movements(mailbox_id,movement_type,reference_id,reference_code,article_id,description,operator_user_id,notes,change_before,change_after)
  VALUES(v_old.mailbox_id,'MODIFICA',v_old.id,v_old.reference_code,v_old.article_id,'Vendita articolo modificata',auth.uid(),v_old.reference_code,v_before,v_after);
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_update_customer_sale(uuid,date,integer,numeric,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_update_customer_payment(
  p_payment_id uuid,
  p_payment_date date,
  p_amount_eur numeric,
  p_notes text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_payment public.payments%ROWTYPE;
  v_movement public.movements%ROWTYPE;
  v_allocated numeric := 0;
  v_before jsonb;
  v_after jsonb;
  v_amount numeric;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Operazione non autorizzata'; END IF;
  IF p_amount_eur IS NULL OR p_amount_eur <= 0 THEN RAISE EXCEPTION 'Importo non valido'; END IF;
  SELECT * INTO v_payment FROM public.payments WHERE id=p_payment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pagamento non trovato'; END IF;
  IF v_payment.status='ANNULLATO' THEN RAISE EXCEPTION 'Il pagamento è annullato e non può essere modificato'; END IF;
  SELECT coalesce(sum(pa.amount_eur),0) INTO v_allocated FROM public.payment_allocations pa WHERE pa.payment_id=p_payment_id;
  IF p_amount_eur < v_allocated THEN RAISE EXCEPTION 'L''importo non può essere inferiore alla quota già attribuita ( %)',v_allocated; END IF;

  v_before := jsonb_build_object('date',v_payment.payment_date,'amount_eur',v_payment.amount_eur,'notes',v_payment.notes);
  v_amount := CASE WHEN upper(coalesce(v_payment.currency,'EUR'))='EUR' THEN p_amount_eur ELSE p_amount_eur*v_payment.exchange_rate END;

  UPDATE public.payments SET payment_date=coalesce(p_payment_date,current_date), amount_eur=round(p_amount_eur,2), amount=round(v_amount,2), notes=nullif(btrim(p_notes),'') WHERE id=p_payment_id;
  SELECT * INTO v_movement FROM public.movements WHERE movement_type='PAGAMENTO' AND reference_id=p_payment_id ORDER BY movement_at DESC LIMIT 1 FOR UPDATE;
  IF FOUND THEN
    UPDATE public.movements SET movement_at=coalesce(p_payment_date,current_date)::timestamptz,total_amount_eur=-round(p_amount_eur,2),notes=nullif(btrim(p_notes),'') WHERE id=v_movement.id;
  END IF;
  v_after := jsonb_build_object('date',coalesce(p_payment_date,current_date),'amount_eur',round(p_amount_eur,2),'notes',nullif(btrim(p_notes),''));

  INSERT INTO public.movements(mailbox_id,movement_type,reference_id,reference_code,description,operator_user_id,notes,change_before,change_after)
  VALUES(v_payment.mailbox_id,'MODIFICA',p_payment_id,v_payment.payment_code,'Pagamento modificato',auth.uid(),v_payment.payment_code,v_before,v_after);
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_update_customer_payment(uuid,date,numeric,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_update_customer_credit(
  p_credit_id uuid,
  p_credit_date date,
  p_amount_eur numeric,
  p_notes text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_credit public.credits%ROWTYPE;
  v_movement public.movements%ROWTYPE;
  v_before jsonb;
  v_after jsonb;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Operazione non autorizzata'; END IF;
  IF p_amount_eur IS NULL OR p_amount_eur <= 0 THEN RAISE EXCEPTION 'Importo non valido'; END IF;
  SELECT * INTO v_credit FROM public.credits WHERE id=p_credit_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Credito non trovato'; END IF;
  IF v_credit.status='ANNULLATO' THEN RAISE EXCEPTION 'Il credito è annullato e non può essere modificato'; END IF;
  IF p_amount_eur < coalesce(v_credit.used_amount_eur,0) THEN RAISE EXCEPTION 'L''importo non può essere inferiore al credito già utilizzato ( %)',v_credit.used_amount_eur; END IF;

  v_before := jsonb_build_object('date',v_credit.credit_date,'amount_eur',v_credit.amount_eur,'used_amount_eur',v_credit.used_amount_eur,'notes',v_credit.notes);
  UPDATE public.credits SET credit_date=coalesce(p_credit_date,current_date),amount_eur=round(p_amount_eur,2),notes=nullif(btrim(p_notes),'') ,status=CASE WHEN p_amount_eur<=coalesce(used_amount_eur,0) THEN 'ESAURITO' ELSE 'ATTIVO' END WHERE id=p_credit_id;
  SELECT * INTO v_movement FROM public.movements WHERE movement_type='CREDITO' AND reference_id=p_credit_id ORDER BY movement_at DESC LIMIT 1 FOR UPDATE;
  IF FOUND THEN UPDATE public.movements SET movement_at=coalesce(p_credit_date,current_date)::timestamptz,total_amount_eur=-greatest(0,round(p_amount_eur,2)-coalesce(v_credit.used_amount_eur,0)),notes=nullif(btrim(p_notes),'') WHERE id=v_movement.id; END IF;
  v_after := jsonb_build_object('date',coalesce(p_credit_date,current_date),'amount_eur',round(p_amount_eur,2),'used_amount_eur',v_credit.used_amount_eur,'notes',nullif(btrim(p_notes),''));
  INSERT INTO public.movements(mailbox_id,movement_type,reference_id,reference_code,description,operator_user_id,notes,change_before,change_after)
  VALUES(v_credit.mailbox_id,'MODIFICA',p_credit_id,v_credit.credit_code,'Credito modificato',auth.uid(),v_credit.credit_code,v_before,v_after);
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_update_customer_credit(uuid,date,numeric,text) TO authenticated;
NOTIFY pgrst,'reload schema';
