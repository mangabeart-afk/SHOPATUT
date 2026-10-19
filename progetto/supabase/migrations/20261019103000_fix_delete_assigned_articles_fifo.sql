-- ShopATUT 19/10/2026
-- Eliminazione articolo assegnato: riconosce tutti gli stati logistici validi
-- della casella e rialloca in FIFO i pagamenti liberati dall'annullamento vendita.

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
  v_released record;
  v_target_sale record;
  v_original_total numeric := 0;
  v_original_qty integer := 0;
  v_remaining numeric := 0;
  v_available numeric := 0;
  v_alloc numeric := 0;
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

  -- I nuovi stati logistici delle assegnazioni sono espliciti. In particolare,
  -- IN_ARRIVO non deve essere scambiato per un'assegnazione mancante.
  IF v_sale.mailbox_id IS NOT NULL THEN
    SELECT COALESCE(SUM(aa.quantity_assigned), 0)
      INTO v_current_assigned
    FROM public.article_assignments aa
    WHERE aa.article_id = v_sale.article_id
      AND aa.mailbox_id = v_sale.mailbox_id
      AND aa.quantity_assigned > 0
      AND aa.status IN ('ATTIVA', 'IN_ARRIVO', 'IN_STOCK', 'IN_BOX', 'SPEDITO');

    SELECT COALESCE(SUM(si.quantity_shipped), 0)
      INTO v_shipped
    FROM public.shipment_items si
    JOIN public.shipments s ON s.id = si.shipment_id
    WHERE si.article_id = v_sale.article_id
      AND si.mailbox_id = v_sale.mailbox_id
      AND s.status <> 'ANNULLATA';

    IF v_current_assigned < v_original_qty THEN
      RAISE EXCEPTION 'Impossibile annullare la vendita: le assegnazioni attive della casella non coprono la quantità venduta';
    END IF;
    IF v_current_assigned - v_original_qty < v_shipped THEN
      RAISE EXCEPTION 'Impossibile annullare la vendita: una parte dell''articolo è già stata spedita';
    END IF;
  END IF;

  -- La riga storica cambia tipo e quantità, ma conserva l'importo originario:
  -- il movimento STORNO negativo compensa questa riga nel saldo complessivo.
  -- Azzerare anche total_amount_eur produrrebbe un doppio storno del saldo.
  UPDATE public.movements
  SET movement_type = 'ANNULLAMENTO',
      description = 'Vendita articolo annullata',
      notes = CONCAT_WS(' | ', NULLIF(BTRIM(notes), ''),
        'Vendita annullata: ', v_original_qty, ' x €',
        ROUND(COALESCE(v_sale.unit_price_eur, 0), 2)),
      quantity = 0,
      unit_price_eur = NULL,
      total_amount_eur = v_original_total
  WHERE id = p_movement_id;

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

  -- Il valore già allocato alla vendita eliminata viene spostato, pagamento per
  -- pagamento, sulle altre vendite insolute della stessa casella in ordine FIFO.
  -- Se non restano debiti, la quota rimane non allocata come credito della casella.
  IF v_sale.mailbox_id IS NOT NULL THEN
    FOR v_released IN
      SELECT pa.payment_id, ROUND(SUM(pa.amount_eur), 2) AS released_amount
      FROM public.payment_allocations pa
      JOIN public.payments payment_record ON payment_record.id = pa.payment_id
      WHERE pa.movement_id = p_movement_id
      GROUP BY pa.payment_id, payment_record.payment_date
      ORDER BY payment_record.payment_date ASC NULLS LAST, pa.payment_id ASC
    LOOP
      v_remaining := GREATEST(0, ROUND(COALESCE(v_released.released_amount, 0), 2));

      FOR v_target_sale IN
        SELECT
          m.id,
          GREATEST(
            0,
            ROUND(
              COALESCE(m.total_amount_eur, 0) - COALESCE((
                SELECT SUM(pa2.amount_eur)
                FROM public.payment_allocations pa2
                WHERE pa2.movement_id = m.id
              ), 0),
              2
            )
          ) AS available
        FROM public.movements m
        WHERE m.mailbox_id = v_sale.mailbox_id
          AND m.movement_type = 'VENDITA'
          AND COALESCE(m.total_amount_eur, 0) > 0
          AND m.id <> p_movement_id
        ORDER BY m.movement_at ASC NULLS LAST, m.id ASC
        FOR UPDATE OF m
      LOOP
        EXIT WHEN v_remaining <= 0;
        v_available := COALESCE(v_target_sale.available, 0);
        IF v_available <= 0 THEN
          CONTINUE;
        END IF;

        v_alloc := LEAST(v_remaining, v_available);
        IF v_alloc > 0 THEN
          INSERT INTO public.payment_allocations AS existing_allocation(payment_id, movement_id, amount_eur)
          VALUES (v_released.payment_id, v_target_sale.id, ROUND(v_alloc, 2))
          ON CONFLICT (payment_id, movement_id)
          DO UPDATE SET amount_eur = existing_allocation.amount_eur + EXCLUDED.amount_eur;
          v_remaining := ROUND(v_remaining - v_alloc, 2);
        END IF;
      END LOOP;
    END LOOP;
  END IF;

  -- Rimuove solo dopo la riallocazione le allocazioni sulla vendita annullata.
  DELETE FROM public.payment_allocations
  WHERE movement_id = p_movement_id;

  -- Rimuove la quantità venduta dalle assegnazioni attive della casella in FIFO.
  -- Una riga completamente consumata viene marcata ANNULLATA senza porre Q a zero.
  IF v_sale.mailbox_id IS NOT NULL THEN
    v_to_remove := v_original_qty;
    FOR v_row IN
      SELECT *
      FROM public.article_assignments
      WHERE article_id = v_sale.article_id
        AND mailbox_id = v_sale.mailbox_id
        AND quantity_assigned > 0
        AND status IN ('ATTIVA', 'IN_ARRIVO', 'IN_STOCK', 'IN_BOX', 'SPEDITO')
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

-- Cancellazione coordinata: conserva lo storico finanziario, annulla le
-- assegnazioni, elimina le righe logistiche di spedizioni già annullate e poi l'articolo.
CREATE OR REPLACE FUNCTION public.admin_delete_articles(p_article_ids uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_sale_id uuid;
  v_has_shipment boolean;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Operazione non autorizzata';
  END IF;

  IF p_article_ids IS NULL OR COALESCE(array_length(p_article_ids, 1), 0) = 0 THEN
    RAISE EXCEPTION 'Nessun articolo selezionato';
  END IF;

  PERFORM 1
  FROM public.articles a
  WHERE a.id = ANY(p_article_ids)
    AND a.deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Nessun articolo valido da cancellare';
  END IF;

  -- Non eliminare fisicamente movimenti appartenenti a spedizioni ancora attive.
  SELECT EXISTS (
    SELECT 1
    FROM public.shipment_items si
    JOIN public.shipments s ON s.id = si.shipment_id
    WHERE si.article_id = ANY(p_article_ids)
      AND s.status <> 'ANNULLATA'
  ) INTO v_has_shipment;

  IF v_has_shipment THEN
    RAISE EXCEPTION 'Impossibile cancellare: uno o più articoli sono presenti in una spedizione non annullata.';
  END IF;

  FOR v_sale_id IN
    SELECT m.id
    FROM public.movements m
    WHERE m.article_id = ANY(p_article_ids)
      AND m.movement_type = 'VENDITA'
    ORDER BY m.movement_at ASC NULLS LAST, m.id ASC
  LOOP
    PERFORM public.admin_delete_customer_sale(v_sale_id);
  END LOOP;

  -- Rimuove eventuali allocazioni residue collegate allo storico da cancellare.
  DELETE FROM public.payment_allocations pa
  USING public.movements m
  WHERE pa.movement_id = m.id
    AND m.article_id = ANY(p_article_ids);

  DELETE FROM public.shipment_items si
  USING public.shipments s
  WHERE si.shipment_id = s.id
    AND si.article_id = ANY(p_article_ids)
    AND s.status = 'ANNULLATA';

  DELETE FROM public.article_assignments
  WHERE article_id = ANY(p_article_ids);

  DELETE FROM public.movements
  WHERE article_id = ANY(p_article_ids)
    AND movement_type IN ('ARTICOLO', 'MODIFICA');

  UPDATE public.movements
  SET article_id = NULL
  WHERE article_id = ANY(p_article_ids);

  DELETE FROM public.articles
  WHERE id = ANY(p_article_ids);
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_delete_articles(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_articles(uuid[]) TO authenticated;

NOTIFY pgrst, 'reload schema';
