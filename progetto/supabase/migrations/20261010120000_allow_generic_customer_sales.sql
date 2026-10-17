-- Consente vendite a clienti occasionali senza creare una scheda cliente.
-- Le vendite restano registrate nello storico con il nominativo fornito.
CREATE OR REPLACE FUNCTION public.register_article_sales(
  p_customer_code text,
  p_lines jsonb,
  p_movement_date date,
  p_is_generic_customer boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_customer_id uuid;
  v_mailbox_id uuid;
  v_line jsonb;
  v_article_id uuid;
  v_qty integer;
  v_price numeric(12,2);
  v_available integer;
  v_total numeric(12,2);
  v_remaining integer;
  v_assignment_id uuid;
  v_existing integer;
  v_current_status text;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Operazione non autorizzata'; END IF;
  IF nullif(btrim(p_customer_code), '') IS NULL THEN RAISE EXCEPTION 'Codice cliente obbligatorio'; END IF;

  IF coalesce(p_is_generic_customer, false) THEN
    -- Vendita occasionale: nessun cliente, casella o assegnazione viene creato.
    v_customer_id := NULL;
    v_mailbox_id := NULL;
  ELSE
    SELECT c.id INTO v_customer_id
    FROM public.customers c
    WHERE upper(c.customer_code) = upper(btrim(p_customer_code))
    LIMIT 1;
    IF v_customer_id IS NULL THEN RAISE EXCEPTION 'Codice cliente non trovato: %', p_customer_code; END IF;

    SELECT m.id INTO v_mailbox_id
    FROM public.mailboxes m
    WHERE m.customer_id = v_customer_id
    LIMIT 1;
  END IF;

  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'Nessun articolo selezionato';
  END IF;

  FOR v_line IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
    v_article_id := nullif(v_line ->> 'article_id', '')::uuid;
    v_qty := coalesce((v_line ->> 'quantity')::integer, 0);
    v_price := coalesce((v_line ->> 'price')::numeric, 0);
    IF v_article_id IS NULL OR v_qty <= 0 OR v_price <= 0 THEN
      RAISE EXCEPTION 'Quantità e prezzo devono essere maggiori di zero';
    END IF;

    SELECT a.quantity_purchased
         - coalesce((
             SELECT sum(mv.quantity)
             FROM public.movements mv
             WHERE mv.article_id = a.id
               AND mv.movement_type = 'VENDITA'
               AND coalesce(mv.quantity,0) > 0
               AND NOT EXISTS (
                 SELECT 1
                 FROM public.movements x
                 WHERE x.movement_type = 'ANNULLAMENTO'
                   AND x.reference_id = mv.id
               )
           ),0),
           a.status
    INTO v_available, v_current_status
    FROM public.articles a
    WHERE a.id = v_article_id
      AND a.deleted_at IS NULL
    FOR UPDATE;

    IF v_available IS NULL THEN
      RAISE EXCEPTION 'Articolo non trovato o già eliminato: %', v_article_id;
    END IF;
    IF v_qty > v_available THEN
      RAISE EXCEPTION 'Quantità non disponibile per articolo %: residua %', v_article_id, v_available;
    END IF;
  END LOOP;

  FOR v_line IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
    v_article_id := (v_line ->> 'article_id')::uuid;
    v_qty := (v_line ->> 'quantity')::integer;
    v_price := (v_line ->> 'price')::numeric;
    v_total := round(v_qty * v_price, 2);

    IF v_mailbox_id IS NOT NULL THEN
      SELECT id, quantity_assigned
      INTO v_assignment_id, v_existing
      FROM public.article_assignments
      WHERE article_id = v_article_id
        AND mailbox_id = v_mailbox_id
        AND status IN ('ATTIVA','IN_BOX')
      ORDER BY assigned_at ASC, id ASC
      LIMIT 1
      FOR UPDATE;

      IF v_assignment_id IS NULL THEN
        INSERT INTO public.article_assignments(
          article_id, mailbox_id, quantity_assigned, status, notes
        )
        VALUES (
          v_article_id, v_mailbox_id, v_qty, 'ATTIVA', 'Assegnazione da vendita'
        )
        RETURNING id INTO v_assignment_id;
      ELSE
        UPDATE public.article_assignments
        SET quantity_assigned = quantity_assigned + v_qty
        WHERE id = v_assignment_id;
      END IF;
    END IF;

    INSERT INTO public.movements(
      mailbox_id, movement_type, article_id, quantity, unit_price_eur,
      total_amount_eur, generic_customer_name, customer_name, description,
      operator_user_id, movement_at
    )
    VALUES (
      v_mailbox_id, 'VENDITA', v_article_id, v_qty, v_price, v_total,
      upper(btrim(p_customer_code)), upper(btrim(p_customer_code)),
      CASE WHEN v_mailbox_id IS NULL
           THEN 'Vendita articolo - cliente senza casella'
           ELSE 'Vendita articolo'
      END,
      auth.uid(), coalesce(p_movement_date, current_date)::timestamptz
    );

    SELECT a.quantity_purchased
         - coalesce((
             SELECT sum(mv.quantity)
             FROM public.movements mv
             WHERE mv.article_id = a.id
               AND mv.movement_type = 'VENDITA'
               AND NOT EXISTS (
                 SELECT 1
                 FROM public.movements x
                 WHERE x.movement_type = 'ANNULLAMENTO'
                   AND x.reference_id = mv.id
               )
           ),0),
           a.status
    INTO v_remaining, v_current_status
    FROM public.articles a
    WHERE a.id = v_article_id;

    UPDATE public.articles
    SET status = CASE
      WHEN v_current_status = 'IN_ARRIVO' THEN 'IN_ARRIVO'
      WHEN v_remaining <= 0 THEN 'VENDUTO'
      ELSE 'IN_STOCK'
    END,
    updated_at = now()
    WHERE id = v_article_id;
  END LOOP;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.register_article_sales(text,jsonb,date,boolean) TO authenticated;

NOTIFY pgrST, 'reload schema';
