CREATE OR REPLACE FUNCTION public.cancel_customer_shipment(p_shipment_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
DECLARE
  v_shipment public.shipments%ROWTYPE;
  v_payment public.payments%ROWTYPE;
  v_amount numeric;
  v_payment_movement public.movements%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Operazione non autorizzata';
  END IF;

  SELECT * INTO v_shipment
  FROM public.shipments
  WHERE id = p_shipment_id
  FOR UPDATE;

  IF v_shipment.id IS NULL THEN
    RAISE EXCEPTION 'Spedizione non trovata';
  END IF;

  IF v_shipment.status = 'ANNULLATA' THEN
    RAISE EXCEPTION 'La spedizione era già annullata';
  END IF;

  -- Neutralizza il costo della spedizione nel saldo e registra lo storno.
  UPDATE public.movements
  SET total_amount_eur = 0
  WHERE reference_id = v_shipment.id
    AND movement_type = 'SPEDIZIONE';

  IF COALESCE(v_shipment.shipping_cost_eur, 0) > 0 THEN
    INSERT INTO public.movements(
      mailbox_id, movement_type, reference_id, reference_code,
      total_amount_eur, description, operator_user_id
    ) VALUES (
      v_shipment.mailbox_id, 'STORNO', v_shipment.id, v_shipment.shipment_code,
      -v_shipment.shipping_cost_eur,
      'Storno costo spedizione ' || v_shipment.shipment_code,
      auth.uid()
    );
  END IF;

  -- Cerca l'eventuale pagamento registrato contestualmente alla spedizione.
  FOR v_payment IN
    SELECT *
    FROM public.payments
    WHERE mailbox_id = v_shipment.mailbox_id
      AND status <> 'ANNULLATO'
      AND (
        reference = v_shipment.shipment_code
        OR (payment_method = 'SPEDIZIONE' AND notes ILIKE '%' || v_shipment.shipment_code || '%')
      )
    FOR UPDATE
  LOOP
    v_amount := COALESCE(v_payment.amount_eur, 0);

    -- Rimuove le allocazioni del pagamento: non deve più coprire il movimento annullato.
    DELETE FROM public.payment_allocations
    WHERE payment_id = v_payment.id;

    UPDATE public.payments
    SET status = 'ANNULLATO'
    WHERE id = v_payment.id;

    -- Manteniamo il movimento originale come storico e generiamo lo storno opposto.
    UPDATE public.movements
    SET total_amount_eur = -v_amount,
        notes = concat_ws(' | ', notes, 'Pagamento annullato per annullamento spedizione')
    WHERE reference_id = v_payment.id
      AND movement_type = 'PAGAMENTO';

    IF v_amount > 0 THEN
      INSERT INTO public.movements(
        mailbox_id, movement_type, reference_id, reference_code,
        total_amount_eur, description, operator_user_id, notes
      ) VALUES (
        v_shipment.mailbox_id, 'STORNO', v_payment.id, v_payment.payment_code,
        v_amount,
        'Storno pagamento spedizione ' || v_shipment.shipment_code,
        auth.uid(),
        'Pagamento annullato contestualmente alla spedizione'
      );
    END IF;
  END LOOP;

  UPDATE public.shipments
  SET status = 'ANNULLATA'
  WHERE id = p_shipment_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_customer_shipment(uuid) TO authenticated;
NOTIFY pgrst, 'reload schema';
