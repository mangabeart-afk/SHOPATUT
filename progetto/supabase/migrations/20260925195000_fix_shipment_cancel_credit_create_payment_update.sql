-- Live fix: shipment cancellation, atomic manual credit creation and customer payment edits.
-- The same SQL was applied to the production Supabase project.

CREATE OR REPLACE FUNCTION public.cancel_customer_shipment(p_shipment_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $function$
DECLARE
  v_shipment public.shipments%ROWTYPE;
  v_payment public.payments%ROWTYPE;
  v_snapshot jsonb;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Operazione non autorizzata'; END IF;
  SELECT * INTO v_shipment FROM public.shipments WHERE id=p_shipment_id FOR UPDATE;
  IF v_shipment.id IS NULL THEN RAISE EXCEPTION 'Spedizione non trovata'; END IF;
  IF v_shipment.status='ANNULLATA' THEN RAISE EXCEPTION 'La spedizione era già annullata'; END IF;
  v_snapshot := jsonb_build_object(
    'shipment',to_jsonb(v_shipment),
    'items',COALESCE((SELECT jsonb_agg(to_jsonb(i) ORDER BY i.id) FROM public.shipment_items i WHERE i.shipment_id=v_shipment.id),'[]'::jsonb),
    'payments',COALESCE((SELECT jsonb_agg(to_jsonb(pay) ORDER BY pay.id) FROM public.payments pay WHERE pay.mailbox_id=v_shipment.mailbox_id AND pay.status<>'ANNULLATO' AND (pay.reference=v_shipment.shipment_code OR (pay.payment_method='SPEDIZIONE' AND pay.notes ILIKE '%'||v_shipment.shipment_code||'%'))),'[]'::jsonb)
  );
  UPDATE public.movements SET total_amount_eur=0 WHERE reference_id=v_shipment.id AND movement_type='SPEDIZIONE';
  IF COALESCE(v_shipment.shipping_cost_eur,0)>0 THEN
    INSERT INTO public.movements(mailbox_id,movement_type,reference_id,reference_code,total_amount_eur,description,operator_user_id)
    VALUES(v_shipment.mailbox_id,'STORNO',v_shipment.id,v_shipment.shipment_code,-v_shipment.shipping_cost_eur,'Storno costo spedizione '||v_shipment.shipment_code,auth.uid());
  END IF;
  FOR v_payment IN SELECT pay.* FROM public.payments AS pay WHERE pay.mailbox_id=v_shipment.mailbox_id AND pay.status<>'ANNULLATO' AND (pay.reference=v_shipment.shipment_code OR (pay.payment_method='SPEDIZIONE' AND pay.notes ILIKE '%'||v_shipment.shipment_code||'%')) FOR UPDATE LOOP
    UPDATE public.payments SET status='ANNULLATO' WHERE id=v_payment.id;
    UPDATE public.movements SET total_amount_eur=0,notes=concat_ws(' | ',notes,'Pagamento annullato per annullamento spedizione') WHERE reference_id=v_payment.id AND movement_type='PAGAMENTO';
  END LOOP;
  UPDATE public.shipments SET status='ANNULLATA' WHERE id=v_shipment.id;
  INSERT INTO public.movements(mailbox_id,movement_type,reference_id,reference_code,total_amount_eur,description,operator_user_id,change_before) VALUES(v_shipment.mailbox_id,'ANNULLAMENTO',v_shipment.id,v_shipment.shipment_code,0,'Spedizione annullata',auth.uid(),v_snapshot);
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_update_customer_payment(p_payment_id uuid,p_payment_date date,p_amount_eur numeric,p_notes text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public AS $function$
DECLARE v_payment public.payments%ROWTYPE; v_movement public.movements%ROWTYPE; v_allocated numeric:=0; v_before jsonb; v_after jsonb; v_amount numeric;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Operazione non autorizzata'; END IF;
  IF p_amount_eur IS NULL OR p_amount_eur<=0 THEN RAISE EXCEPTION 'Importo non valido'; END IF;
  SELECT * INTO v_payment FROM public.payments WHERE id=p_payment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pagamento non trovato'; END IF;
  IF v_payment.status='ANNULLATO' THEN RAISE EXCEPTION 'Il pagamento è annullato e non può essere modificato'; END IF;
  SELECT COALESCE(SUM(pa.amount_eur),0) INTO v_allocated FROM public.payment_allocations pa WHERE pa.payment_id=p_payment_id;
  IF p_amount_eur<v_allocated THEN RAISE EXCEPTION 'L''importo non può essere inferiore alla quota già attribuita (%)',v_allocated; END IF;
  v_before=jsonb_build_object('date',v_payment.payment_date,'amount_eur',v_payment.amount_eur,'notes',v_payment.notes);
  v_amount=CASE WHEN upper(coalesce(v_payment.currency,'EUR'))='EUR' THEN p_amount_eur ELSE p_amount_eur*coalesce(v_payment.exchange_rate,1) END;
  UPDATE public.payments SET payment_date=coalesce(p_payment_date,current_date),amount_eur=round(p_amount_eur,2),amount=round(v_amount,2),notes=nullif(btrim(p_notes),'') WHERE id=p_payment_id;
  SELECT * INTO v_movement FROM public.movements WHERE movement_type='PAGAMENTO' AND reference_id=p_payment_id ORDER BY movement_at DESC LIMIT 1 FOR UPDATE;
  IF FOUND THEN UPDATE public.movements SET movement_at=coalesce(p_payment_date,current_date)::timestamptz,total_amount_eur=-round(p_amount_eur,2),notes=nullif(btrim(p_notes),'') WHERE id=v_movement.id;
  ELSE INSERT INTO public.movements(mailbox_id,movement_type,reference_id,reference_code,movement_at,total_amount_eur,description,operator_user_id,notes) VALUES(v_payment.mailbox_id,'PAGAMENTO',p_payment_id,v_payment.payment_code,coalesce(p_payment_date,current_date)::timestamptz,-round(p_amount_eur,2),'Pagamento',auth.uid(),nullif(btrim(p_notes),'')); END IF;
  v_after=jsonb_build_object('date',coalesce(p_payment_date,current_date),'amount_eur',round(p_amount_eur,2),'notes',nullif(btrim(p_notes),''));
  INSERT INTO public.movements(mailbox_id,movement_type,reference_id,reference_code,description,operator_user_id,notes,change_before,change_after) VALUES(v_payment.mailbox_id,'MODIFICA',p_payment_id,v_payment.payment_code,'Pagamento modificato',auth.uid(),v_payment.payment_code,v_before,v_after);
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_create_customer_credit(p_mailbox_id uuid,p_credit_date date,p_amount_eur numeric,p_reason text DEFAULT NULL,p_notes text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public AS $function$
DECLARE v_credit_id uuid; v_credit_code text;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Operazione non autorizzata'; END IF;
  IF p_mailbox_id IS NULL THEN RAISE EXCEPTION 'Seleziona una casella'; END IF;
  IF p_amount_eur IS NULL OR p_amount_eur<=0 THEN RAISE EXCEPTION 'L''importo del credito deve essere maggiore di zero'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.mailboxes WHERE id=p_mailbox_id) THEN RAISE EXCEPTION 'Casella non trovata'; END IF;
  INSERT INTO public.credits(mailbox_id,credit_date,amount_eur,reason,notes) VALUES(p_mailbox_id,coalesce(p_credit_date,current_date),round(p_amount_eur,2),nullif(btrim(p_reason),''),nullif(btrim(p_notes),'')) RETURNING id,credit_code INTO v_credit_id,v_credit_code;
  INSERT INTO public.movements(mailbox_id,movement_type,reference_id,reference_code,total_amount_eur,movement_at,description,operator_user_id,notes) VALUES(p_mailbox_id,'CREDITO',v_credit_id,v_credit_code,-round(p_amount_eur,2),coalesce(p_credit_date,current_date)::timestamptz,coalesce(nullif(btrim(p_reason),''),'Credito cliente'),auth.uid(),nullif(btrim(p_notes),''));
  RETURN v_credit_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.cancel_customer_shipment(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_customer_payment(uuid,date,numeric,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_create_customer_credit(uuid,date,numeric,text,text) TO authenticated;
NOTIFY pgrst,'reload schema';
