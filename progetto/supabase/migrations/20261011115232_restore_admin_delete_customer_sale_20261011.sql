-- Ripristina la RPC usata sia dalla cancellazione articoli sia dall'annullamento
-- della singola vendita. Supporta vendite assegnate e vendite a clienti occasionali.
CREATE OR REPLACE FUNCTION public.admin_delete_customer_sale(
  p_movement_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_sale public.movements%ROWTYPE;
  v_article public.articles%ROWTYPE;
  v_current_assigned integer := 0;
  v_shipped integer := 0;
  v_remaining_sold integer := 0;
  v_to_remove integer := 0;
  v_row public.article_assignments%ROWTYPE;
  v_original_total numeric := 0;
  v_original_qty integer := 0;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Operazione non autorizzata';
  END IF;

  SELECT * INTO v_sale
  FROM public.movements
  WHERE id = p_movement_id AND movement_type = 'VENDITA'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Vendita non trovata o già annullata';
  END IF;
  IF v_sale.article_id IS NULL THEN
    RAISE EXCEPTION 'Vendita non collegata a un articolo';
  END IF;

  v_original_qty := COALESCE(v_sale.quantity, 0);
  v_original_total := COALESCE(v_sale.total_amount_eur, 0);
  IF v_original_qty <= 0 THEN
    RAISE EXCEPTION 'Quantità vendita non valida';
  END IF;

  SELECT * INTO v_article
  FROM public.articles
  WHERE id = v_sale.article_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Articolo non trovato';
  END IF;

  -- Le vendite occasionali non hanno assegnazione né spedizione da modificare.
  -- Per le vendite a casella, controlla assegnazioni e spedizioni prima dello storno.
  IF v_sale.mailbox_id IS NOT NULL THEN
    SELECT COALESCE(SUM(quantity_assigned), 0) INTO v_current_assigned
    FROM public.article_assignments
    WHERE article_id = v_sale.article_id
      AND mailbox_id = v_sale.mailbox_id
      AND status IN ('ATTIVA', 'IN_BOX');

    SELECT COALESCE(SUM(si.quantity_shipped), 0) INTO v_shipped
    FROM public.shipment_items si
    JOIN public.shipments s ON s.id = si.shipment_id
    WHERE si.article_id = v_sale.article_id
      AND si.mailbox_id = v_sale.mailbox_id
      AND s.status <> 'ANNULLATA';

    IF v_current_assigned < v_original_qty THEN
      RAISE EXCEPTION 'Impossibile annullare la vendita: quantità assegnata incoerente';
    END IF;
    IF v_current_assigned - v_original_qty < v_shipped THEN
      RAISE EXCEPTION 'Impossibile annullare la vendita: una parte dell''articolo è già stata spedita';
    END IF;
  END IF;

  -- La vendita originale resta nello storico come annullata, non produce più ricavi.
  UPDATE public.movements
  SET movement_type = 'ANNULLAMENTO',
      description = 'Vendita articolo annullata',
      notes = CONCAT_WS(' | ', NULLIF(BTRIM(notes), ''),
        'Vendita annullata: ', v_original_qty, ' x €',
        ROUND(COALESCE(v_sale.unit_price_eur, 0), 2)),
      quantity = 0,
      unit_price_eur = NULL,
      total_amount_eur = 0
  WHERE id = p_movement_id;

  -- Movimento compensativo: il ricavo viene stornato una sola volta.
  INSERT INTO public.movements(
    mailbox_id, movement_type, reference_id, reference_code, article_id,
    quantity, unit_price_eur, total_amount_eur, generic_customer_name,
    customer_name, description, operator_user_id, notes, movement_at
  )
  VALUES(
    v_sale.mailbox_id, 'STORNO', v_sale.id, v_sale.reference_code, v_sale.article_id,
    -v_original_qty, v_sale.unit_price_eur, -v_original_total,
    v_sale.generic_customer_name, v_sale.customer_name,
    'Storno vendita articolo', auth.uid(), v_sale.reference_code, now()
  );

  -- Mantiene l'incasso ma lo rende non allocato alla vendita annullata.
  -- Non elimina o modifica il pagamento/acconto originale.
  DELETE FROM public.payment_allocations
  WHERE movement_id = v_sale.id;

  IF v_sale.mailbox_id IS NOT NULL THEN
    v_to_remove := v_original_qty;
    FOR v_row IN
      SELECT * FROM public.article_assignments
      WHERE article_id = v_sale.article_id
        AND mailbox_id = v_sale.mailbox_id
        AND status IN ('ATTIVA', 'IN_BOX')
      ORDER BY assigned_at ASC, id ASC
      FOR UPDATE
    LOOP
      EXIT WHEN v_to_remove <= 0;
      IF v_row.quantity_assigned <= v_to_remove THEN
        UPDATE public.article_assignments
        SET status = 'ANNULLATA'
        WHERE id = v_row.id;
        v_to_remove := v_to_remove - v_row.quantity_assigned;
      ELSE
        UPDATE public.article_assignments
        SET quantity_assigned = quantity_assigned - v_to_remove
        WHERE id = v_row.id;
        v_to_remove := 0;
      END IF;
    END LOOP;
  END IF;

  SELECT COALESCE(a.legacy_quantity_sold, 0) + COALESCE(SUM(m.quantity), 0)
  INTO v_remaining_sold
  FROM public.articles a
  LEFT JOIN public.movements m
    ON m.article_id = a.id
   AND m.movement_type = 'VENDITA'
   AND NOT EXISTS (
     SELECT 1 FROM public.movements x
     WHERE x.movement_type = 'ANNULLAMENTO'
       AND x.reference_id = m.id
   )
  WHERE a.id = v_sale.article_id
  GROUP BY a.legacy_quantity_sold;

  UPDATE public.articles
  SET status = CASE
      WHEN status = 'IN_ARRIVO' THEN 'IN_ARRIVO'
      WHEN COALESCE(v_remaining_sold, 0) >= quantity_purchased THEN 'VENDUTO'
      ELSE 'IN_STOCK'
    END,
    updated_at = now()
  WHERE id = v_sale.article_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_delete_customer_sale(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_customer_sale(uuid) TO authenticated;
NOTIFY pgrst, 'reload schema';
