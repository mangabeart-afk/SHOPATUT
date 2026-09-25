-- Cancellation is soft: the original record remains in history and the movement list can restore it.
-- LIVE also contains these functions; this file keeps the project source synchronized.

CREATE OR REPLACE FUNCTION public.admin_cancel_payment(p_payment_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p public.payments%rowtype; m public.movements%rowtype; s jsonb;
BEGIN
 IF NOT public.is_admin() THEN RAISE EXCEPTION 'Operazione non autorizzata'; END IF;
 SELECT * INTO p FROM public.payments WHERE id=p_payment_id FOR UPDATE;
 IF p.id IS NULL THEN RAISE EXCEPTION 'Pagamento non trovato'; END IF;
 IF p.status='ANNULLATO' THEN RAISE EXCEPTION 'Pagamento già annullato'; END IF;
 IF EXISTS(SELECT 1 FROM public.payment_allocations WHERE payment_id=p_payment_id) THEN RAISE EXCEPTION 'Impossibile annullare il pagamento: è già distribuito su una o più vendite'; END IF;
 SELECT * INTO m FROM public.movements WHERE reference_id=p_payment_id AND movement_type='PAGAMENTO' ORDER BY movement_at DESC,id DESC LIMIT 1;
 s=jsonb_build_object('payment',to_jsonb(p),'payment_movement',to_jsonb(m));
 UPDATE public.payments SET status='ANNULLATO' WHERE id=p_payment_id;
 UPDATE public.movements SET total_amount_eur=0,notes=concat_ws(' | ',notes,'Pagamento annullato') WHERE reference_id=p_payment_id AND movement_type='PAGAMENTO';
 INSERT INTO public.movements(mailbox_id,movement_type,reference_id,reference_code,total_amount_eur,description,operator_user_id,change_before) VALUES(p.mailbox_id,'ANNULLAMENTO',p_payment_id,p.payment_code,0,'Pagamento annullato',auth.uid(),s);
END; $$;

CREATE OR REPLACE FUNCTION public.admin_cancel_credit(p_credit_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c public.credits%rowtype; m public.movements%rowtype; s jsonb;
BEGIN
 IF NOT public.is_admin() THEN RAISE EXCEPTION 'Operazione non autorizzata'; END IF;
 SELECT * INTO c FROM public.credits WHERE id=p_credit_id FOR UPDATE;
 IF c.id IS NULL THEN RAISE EXCEPTION 'Credito non trovato'; END IF;
 IF c.status='ANNULLATO' THEN RAISE EXCEPTION 'Credito già annullato'; END IF;
 IF COALESCE(c.used_amount_eur,0)>0 THEN RAISE EXCEPTION 'Impossibile annullare un credito già utilizzato'; END IF;
 SELECT * INTO m FROM public.movements WHERE reference_id=p_credit_id AND movement_type='CREDITO' ORDER BY movement_at DESC,id DESC LIMIT 1;
 s=jsonb_build_object('credit',to_jsonb(c),'credit_movement',to_jsonb(m));
 UPDATE public.credits SET status='ANNULLATO' WHERE id=p_credit_id;
 UPDATE public.movements SET total_amount_eur=0,notes=concat_ws(' | ',notes,'Credito annullato') WHERE reference_id=p_credit_id AND movement_type='CREDITO';
 INSERT INTO public.movements(mailbox_id,movement_type,reference_id,reference_code,total_amount_eur,description,operator_user_id,change_before) VALUES(c.mailbox_id,'ANNULLAMENTO',p_credit_id,c.credit_code,0,'Credito annullato',auth.uid(),s);
END; $$;

CREATE OR REPLACE FUNCTION public.admin_restore_cancelled_movement(p_movement_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE m public.movements%rowtype; p public.payments%rowtype; c public.credits%rowtype;
BEGIN
 IF NOT public.is_admin() THEN RAISE EXCEPTION 'Operazione non autorizzata'; END IF;
 SELECT * INTO m FROM public.movements WHERE id=p_movement_id AND movement_type='ANNULLAMENTO' FOR UPDATE;
 IF m.id IS NULL OR m.change_before IS NULL THEN RAISE EXCEPTION 'Dati originali non disponibili'; END IF;
 IF m.description='Pagamento annullato' THEN
  SELECT * INTO p FROM public.payments WHERE id=m.reference_id FOR UPDATE;
  IF p.id IS NULL OR p.status<>'ANNULLATO' THEN RAISE EXCEPTION 'Il pagamento non risulta annullato'; END IF;
  UPDATE public.payments SET status='RICEVUTO' WHERE id=p.id;
  UPDATE public.movements SET total_amount_eur=-p.amount_eur,notes=regexp_replace(notes,' \| Pagamento annullato$','') WHERE reference_id=p.id AND movement_type='PAGAMENTO';
  INSERT INTO public.movements(mailbox_id,movement_type,reference_id,reference_code,total_amount_eur,description,operator_user_id) VALUES(p.mailbox_id,'MODIFICA',p.id,p.payment_code,0,'Pagamento ripristinato',auth.uid());
 ELSIF m.description='Credito annullato' THEN
  SELECT * INTO c FROM public.credits WHERE id=m.reference_id FOR UPDATE;
  IF c.id IS NULL OR c.status<>'ANNULLATO' THEN RAISE EXCEPTION 'Il credito non risulta annullato'; END IF;
  UPDATE public.credits SET status=CASE WHEN amount_eur>used_amount_eur THEN 'ATTIVO' ELSE 'ESAURITO' END WHERE id=c.id;
  UPDATE public.movements SET total_amount_eur=-(c.amount_eur-c.used_amount_eur),notes=regexp_replace(notes,' \| Credito annullato$','') WHERE reference_id=c.id AND movement_type='CREDITO';
  INSERT INTO public.movements(mailbox_id,movement_type,reference_id,reference_code,total_amount_eur,description,operator_user_id) VALUES(c.mailbox_id,'MODIFICA',c.id,c.credit_code,0,'Credito ripristinato',auth.uid());
 ELSE RAISE EXCEPTION 'Questo annullamento non è di un pagamento o credito ripristinabile';
 END IF;
END; $$;

GRANT EXECUTE ON FUNCTION public.admin_cancel_payment(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_cancel_credit(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_restore_cancelled_movement(uuid) TO authenticated;
