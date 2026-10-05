-- SHOPATUT 02/10/2026
-- Gestione robusta cancellazione articoli e gestione pagamenti con riallineamento delle assegnazioni.

-- La cancellazione di un articolo non deve tentare di inserire un movimento
-- con article_id ancora referenziato da una riga appena eliminata.
CREATE OR REPLACE FUNCTION public.audit_entity_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_mailbox_id uuid;
  v_reference_code text;
  v_type text;
  v_description text;
BEGIN
  v_id := COALESCE(NEW.id, OLD.id);

  IF TG_OP = 'DELETE' THEN
    v_type := 'ANNULLAMENTO';
    v_description := CASE TG_TABLE_NAME
      WHEN 'customers' THEN 'Cliente cancellato'
      WHEN 'articles' THEN 'Articolo cancellato'
      WHEN 'payments' THEN 'Pagamento cancellato'
      WHEN 'shipments' THEN 'Spedizione cancellata'
      WHEN 'credits' THEN 'Credito cancellato'
      ELSE 'Record cancellato'
    END;
  ELSE
    v_type := 'MODIFICA';
    v_description := CASE TG_TABLE_NAME
      WHEN 'customers' THEN 'Dati cliente modificati'
      WHEN 'articles' THEN 'Articolo modificato'
      WHEN 'payments' THEN 'Pagamento modificato'
      WHEN 'shipments' THEN 'Spedizione modificata'
      WHEN 'credits' THEN 'Credito modificato'
      ELSE 'Record modificato'
    END;
  END IF;

  IF TG_TABLE_NAME = 'customers' THEN
    SELECT m.id, m.mailbox_code INTO v_mailbox_id, v_reference_code
    FROM public.mailboxes m
    WHERE m.customer_id = v_id
    ORDER BY m.created_at ASC, m.id ASC
    LIMIT 1;
  ELSIF TG_TABLE_NAME = 'articles' THEN
    v_reference_code := COALESCE(NEW.article_code, OLD.article_code);
  ELSIF TG_TABLE_NAME = 'payments' THEN
    v_mailbox_id := COALESCE(NEW.mailbox_id, OLD.mailbox_id);
    v_reference_code := COALESCE(NEW.payment_code, OLD.payment_code);
  ELSIF TG_TABLE_NAME = 'shipments' THEN
    v_mailbox_id := COALESCE(NEW.mailbox_id, OLD.mailbox_id);
    v_reference_code := COALESCE(NEW.shipment_code, OLD.shipment_code);
  ELSIF TG_TABLE_NAME = 'credits' THEN
    v_mailbox_id := COALESCE(NEW.mailbox_id, OLD.mailbox_id);
    v_reference_code := COALESCE(NEW.credit_code, OLD.credit_code);
  END IF;

  INSERT INTO public.movements(
    mailbox_id, movement_type, reference_id, reference_code,
    article_id, description, operator_user_id, movement_at
  )
  VALUES(
    v_mailbox_id,
    v_type,
    v_id,
    v_reference_code,
    CASE
      WHEN TG_TABLE_NAME = 'articles' AND TG_OP <> 'DELETE' THEN v_id
      ELSE NULL
    END,
    v_description,
    auth.uid(),
    now()
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_delete_articles(p_article_ids uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_article_id uuid;
  v_sale_id uuid;
  v_has_shipment boolean;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Operazione non autorizzata';
  END IF;

  IF p_article_ids IS NULL OR COALESCE(array_length(p_article_ids, 1), 0) = 0 THEN
    RAISE EXCEPTION 'Nessun articolo selezionato';
  END IF;

  -- Non permettiamo la cancellazione fisica di articoli già entrati in una
  -- spedizione non annullata: la storia della spedizione deve restare integra.
  SELECT EXISTS (
    SELECT 1
    FROM public.shipment_items si
    JOIN public.shipments s ON s.id = si.shipment_id
    WHERE si.article_id = ANY(p_article_ids)
      AND s.status <> 'ANNULLATA'
  ) INTO v_has_shipment;

  IF v_has_shipment THEN
    RAISE EXCEPTION 'Impossibile cancellare: uno o più articoli sono presenti in una spedizione attiva.';
  END IF;

  -- Blocchiamo gli articoli selezionati prima di intervenire sulle relazioni.
  PERFORM 1
  FROM public.articles a
  WHERE a.id = ANY(p_article_ids)
  FOR UPDATE;

  -- Se esistono vendite, le neutralizziamo attraverso la stessa logica di
  -- storno già usata per l'annullamento di una vendita.
  FOR v_sale_id IN
    SELECT m.id
    FROM public.movements m
    WHERE m.article_id = ANY(p_article_ids)
      AND m.movement_type = 'VENDITA'
    ORDER BY m.movement_at ASC NULLS LAST, m.id ASC
  LOOP
    PERFORM public.admin_delete_customer_sale(v_sale_id);
  END LOOP;

  -- Le allocazioni di pagamento verso vendite che vengono cancellate non
  -- devono più puntare a movimenti che stiamo per rimuovere. Il pagamento
  -- rimane registrato e torna quindi disponibile come non allocato.
  DELETE FROM public.payment_allocations pa
  USING public.movements m
  WHERE pa.movement_id = m.id
    AND m.article_id = ANY(p_article_ids);

  -- Gli elementi di spedizioni già annullate possono essere eliminati insieme
  -- all'articolo, perché non sono più parte di una spedizione attiva.
  DELETE FROM public.shipment_items si
  USING public.shipments s
  WHERE si.shipment_id = s.id
    AND si.article_id = ANY(p_article_ids)
    AND s.status = 'ANNULLATA';

  -- Le assegnazioni vengono annullate/rimosse: il popup di conferma lato UI
  -- avvisa esplicitamente il gestore della cancellazione delle assegnazioni.
  DELETE FROM public.article_assignments
  WHERE article_id = ANY(p_article_ids);

  -- Eliminiamo le registrazioni di acquisto/modifica legate esclusivamente
  -- all'articolo. Le altre tracce finanziarie vengono conservate come storico
  -- ma disaccoppiate dall'articolo cancellato.
  DELETE FROM public.movements
  WHERE article_id = ANY(p_article_ids)
    AND movement_type IN ('ARTICOLO', 'MODIFICA');

  UPDATE public.movements
  SET article_id = NULL
  WHERE article_id = ANY(p_article_ids);

  DELETE FROM public.articles
  WHERE id = ANY(p_article_ids);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_delete_articles(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_articles(uuid[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_update_customer_payment_v2(
  p_payment_id uuid,
  p_payment_date date,
  p_amount_eur numeric,
  p_notes text DEFAULT NULL,
  p_payment_method text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment public.payments%ROWTYPE;
  v_movement_id uuid;
  v_remaining numeric;
  v_available numeric;
  v_alloc numeric;
  v_sale record;
  v_new_amount numeric;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Operazione non autorizzata';
  END IF;
  IF p_payment_id IS NULL OR p_amount_eur IS NULL OR p_amount_eur <= 0 THEN
    RAISE EXCEPTION 'Importo pagamento non valido';
  END IF;
  IF p_payment_date IS NULL THEN
    RAISE EXCEPTION 'Data pagamento non valida';
  END IF;

  SELECT * INTO v_payment
  FROM public.payments
  WHERE id = p_payment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pagamento non trovato';
  END IF;

  IF v_payment.status = 'ANNULLATO' THEN
    RAISE EXCEPTION 'Il pagamento è già annullato';
  END IF;

  v_new_amount := round(p_amount_eur, 2);

  SELECT id INTO v_movement_id
  FROM public.movements
  WHERE reference_id = p_payment_id
    AND movement_type = 'PAGAMENTO'
  ORDER BY movement_at DESC NULLS LAST, id DESC
  LIMIT 1
  FOR UPDATE;

  -- Prima annulliamo sempre l'assegnazione precedente.
  DELETE FROM public.payment_allocations
  WHERE payment_id = p_payment_id;

  UPDATE public.payments
  SET payment_date = p_payment_date,
      amount_eur = v_new_amount,
      payment_method = NULLIF(trim(coalesce(p_payment_method, '')), ''),
      notes = NULLIF(trim(coalesce(p_notes, '')), '')
  WHERE id = p_payment_id;

  IF v_movement_id IS NOT NULL THEN
    UPDATE public.movements
    SET mailbox_id = v_payment.mailbox_id,
        total_amount_eur = -v_new_amount,
        movement_at = p_payment_date::timestamptz,
        notes = NULLIF(trim(coalesce(p_notes, '')), '')
    WHERE id = v_movement_id;
  ELSE
    INSERT INTO public.movements(
      mailbox_id, movement_type, reference_id, reference_code,
      total_amount_eur, description, operator_user_id, notes, movement_at
    )
    VALUES(
      v_payment.mailbox_id, 'PAGAMENTO', v_payment.id, v_payment.payment_code,
      -v_new_amount, 'Pagamento registrato', auth.uid(),
      NULLIF(trim(coalesce(p_notes, '')), ''), p_payment_date::timestamptz
    );
  END IF;

  -- Riallocazione FIFO del nuovo importo sulle vendite ancora insolute.
  v_remaining := v_new_amount;
  FOR v_sale IN
    SELECT
      m.id,
      m.total_amount_eur,
      GREATEST(
        0,
        COALESCE(m.total_amount_eur, 0) -
        COALESCE((
          SELECT SUM(pa.amount_eur)
          FROM public.payment_allocations pa
          WHERE pa.movement_id = m.id
        ), 0)
      ) AS available
    FROM public.movements m
    WHERE m.mailbox_id = v_payment.mailbox_id
      AND m.movement_type = 'VENDITA'
      AND COALESCE(m.total_amount_eur, 0) > 0
    ORDER BY m.movement_at ASC NULLS LAST, m.id ASC
    FOR UPDATE
  LOOP
    v_available := v_sale.available;
    IF v_available <= 0 THEN
      CONTINUE;
    END IF;

    v_alloc := LEAST(v_remaining, v_available);
    IF v_alloc > 0 THEN
      INSERT INTO public.payment_allocations(payment_id, movement_id, amount_eur)
      VALUES (p_payment_id, v_sale.id, v_alloc);
      v_remaining := v_remaining - v_alloc;
    END IF;

    EXIT WHEN v_remaining <= 0;
  END LOOP;

  RETURN p_payment_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_update_customer_payment_v2(uuid, date, numeric, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_customer_payment_v2(uuid, date, numeric, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_delete_customer_payment(p_payment_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment public.payments%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Operazione non autorizzata';
  END IF;

  SELECT * INTO v_payment
  FROM public.payments
  WHERE id = p_payment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pagamento non trovato';
  END IF;

  -- Prima annulliamo tutte le assegnazioni del pagamento.
  DELETE FROM public.payment_allocations
  WHERE payment_id = p_payment_id;

  -- Rimuoviamo il movimento PAGAMENTO: il saldo cliente si aggiorna perché
  -- il movimento negativo del pagamento non esiste più.
  DELETE FROM public.movements
  WHERE reference_id = p_payment_id
    AND movement_type = 'PAGAMENTO';

  DELETE FROM public.payments
  WHERE id = p_payment_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_delete_customer_payment(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_customer_payment(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
