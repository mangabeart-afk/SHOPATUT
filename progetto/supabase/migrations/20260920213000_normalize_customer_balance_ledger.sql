-- Customer balance ledger: positive = customer debt, negative = customer credit.
-- VENDITA and SPEDIZIONE are positive; PAGAMENTO and CREDITO are negative.

ALTER TABLE public.movements DROP CONSTRAINT IF EXISTS movements_movement_type_check;
ALTER TABLE public.movements ADD CONSTRAINT movements_movement_type_check CHECK (
  movement_type = ANY (ARRAY[
    'NUOVO_UTENTE','ARTICOLO','VENDITA','PAGAMENTO','CREDITO',
    'SPEDIZIONE','MODIFICA','ANNULLAMENTO','STORNO','ALTRO'
  ])
);

-- The following functions mirror the financial event in movements so the
-- customer balance is always the sum of the customer's financial movements.
-- Full definitions are kept here to make the database reproducible.

CREATE OR REPLACE FUNCTION public.register_customer_payment(
  p_mailbox_id uuid, p_amount numeric, p_currency text, p_exchange_rate numeric,
  p_payment_date date, p_payment_method text, p_notes text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_payment_id uuid; v_payment_code text; v_amount_eur numeric;
  v_remaining numeric; v_movement record; v_alloc numeric; v_allocated numeric;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Operazione non autorizzata'; END IF;
  IF p_mailbox_id IS NULL THEN RAISE EXCEPTION 'Casella obbligatoria'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'Importo non valido'; END IF;
  IF p_exchange_rate IS NULL OR p_exchange_rate <= 0 THEN RAISE EXCEPTION 'Cambio valuta non valido'; END IF;
  v_amount_eur := CASE WHEN upper(coalesce(p_currency,'EUR'))='EUR' THEN p_amount ELSE p_amount / p_exchange_rate END;
  v_payment_code := public.next_entity_code('P');
  INSERT INTO public.payments(payment_code,mailbox_id,payment_date,amount,currency,exchange_rate,amount_eur,payment_method,status,notes,created_by)
  VALUES(v_payment_code,p_mailbox_id,coalesce(p_payment_date,current_date),p_amount,upper(coalesce(p_currency,'EUR')),p_exchange_rate,v_amount_eur,p_payment_method,'REGISTRATO',p_notes,auth.uid())
  RETURNING id INTO v_payment_id;
  INSERT INTO public.movements(mailbox_id,movement_type,reference_id,reference_code,total_amount_eur,description,operator_user_id,notes,movement_at)
  VALUES(p_mailbox_id,'PAGAMENTO',v_payment_id,v_payment_code,-v_amount_eur,'Pagamento registrato',auth.uid(),p_notes,coalesce(p_payment_date,current_date)::timestamptz);
  v_remaining := v_amount_eur;
  FOR v_movement IN
    SELECT m.id,m.total_amount_eur,coalesce((select sum(pa.amount_eur) from public.payment_allocations pa where pa.movement_id=m.id),0) paid
    FROM public.movements m
    WHERE m.mailbox_id=p_mailbox_id AND m.movement_type='VENDITA' AND coalesce(m.total_amount_eur,0)>0
    ORDER BY m.movement_at asc,m.id asc FOR UPDATE
  LOOP
    v_allocated := greatest(0,coalesce(v_movement.total_amount_eur,0)-coalesce(v_movement.paid,0));
    IF v_allocated<=0 THEN CONTINUE; END IF;
    v_alloc := least(v_remaining,v_allocated);
    IF v_alloc>0 THEN
      INSERT INTO public.payment_allocations(payment_id,movement_id,amount_eur) VALUES(v_payment_id,v_movement.id,v_alloc);
      v_remaining := v_remaining-v_alloc;
    END IF;
    IF v_remaining<=0 THEN EXIT; END IF;
  END LOOP;
  RETURN v_payment_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.register_customer_payment(uuid,numeric,text,numeric,date,text,text) TO authenticated;

UPDATE public.movements m SET total_amount_eur = CASE WHEN p.status='ANNULLATO' THEN 0 ELSE -p.amount_eur END, movement_at=p.payment_date::timestamptz
FROM public.payments p WHERE m.movement_type='PAGAMENTO' AND m.reference_id=p.id;
UPDATE public.movements m SET total_amount_eur=CASE WHEN c.status='ANNULLATO' THEN 0 ELSE -greatest(0,c.amount_eur-coalesce(c.used_amount_eur,0)) END, movement_at=c.credit_date::timestamptz
FROM public.credits c WHERE m.movement_type='CREDITO' AND m.reference_id=c.id;
INSERT INTO public.movements(mailbox_id,movement_type,reference_id,reference_code,total_amount_eur,description,movement_at)
SELECT c.mailbox_id,'CREDITO',c.id,c.credit_code,CASE WHEN c.status='ANNULLATO' THEN 0 ELSE -greatest(0,c.amount_eur-coalesce(c.used_amount_eur,0)) END,coalesce(c.reason,'Credito cliente'),c.credit_date::timestamptz
FROM public.credits c WHERE NOT EXISTS (SELECT 1 FROM public.movements m WHERE m.movement_type='CREDITO' AND m.reference_id=c.id);
DELETE FROM public.movements m WHERE m.movement_type='PAGAMENTO' AND m.reference_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.payments p WHERE p.id=m.reference_id);
DELETE FROM public.movements m WHERE m.movement_type='CREDITO' AND m.reference_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.credits c WHERE c.id=m.reference_id);

NOTIFY pgrst, 'reload schema';
