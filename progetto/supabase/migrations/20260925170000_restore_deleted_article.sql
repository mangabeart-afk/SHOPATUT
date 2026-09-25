-- Ripristino controllato degli articoli eliminati dall'Archivio.
-- Il movimento ANNULLAMENTO dell'eliminazione conserva lo snapshot necessario
-- per ripristinare articolo, vendite e assegnazioni senza cancellare lo storico.

CREATE OR REPLACE FUNCTION public.admin_delete_article(p_article_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sale_id uuid;
  v_article public.articles%rowtype;
  v_snapshot jsonb;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Operazione non autorizzata'; END IF;
  SELECT * INTO v_article FROM public.articles WHERE id = p_article_id FOR UPDATE;
  IF v_article.id IS NULL THEN RAISE EXCEPTION 'Articolo non trovato'; END IF;
  IF v_article.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'Articolo già eliminato'; END IF;
  IF EXISTS (
    SELECT 1
    FROM public.shipment_items si
    JOIN public.shipments s ON s.id = si.shipment_id
    WHERE si.article_id = p_article_id AND s.status <> 'ANNULLATA'
  ) THEN
    RAISE EXCEPTION 'Impossibile eliminare l''articolo: è presente in una spedizione attiva';
  END IF;

  v_snapshot := jsonb_build_object(
    'article', to_jsonb(v_article),
    'sales', COALESCE((
      SELECT jsonb_agg(to_jsonb(m) ORDER BY m.movement_at, m.id)
      FROM public.movements m
      WHERE m.article_id = p_article_id
        AND m.movement_type = 'VENDITA'
        AND COALESCE(m.quantity, 0) > 0
        AND NOT EXISTS (
          SELECT 1 FROM public.movements x
          WHERE x.movement_type = 'ANNULLAMENTO' AND x.reference_id = m.id
        )
    ), '[]'::jsonb),
    'assignments', COALESCE((
      SELECT jsonb_agg(to_jsonb(a) ORDER BY a.assigned_at, a.id)
      FROM public.article_assignments a
      WHERE a.article_id = p_article_id
    ), '[]'::jsonb)
  );

  FOR v_sale_id IN
    SELECT m.id
    FROM public.movements m
    WHERE m.article_id = p_article_id
      AND m.movement_type = 'VENDITA'
      AND COALESCE(m.quantity, 0) > 0
      AND NOT EXISTS (
        SELECT 1 FROM public.movements x
        WHERE x.movement_type = 'ANNULLAMENTO' AND x.reference_id = m.id
      )
    ORDER BY m.movement_at, m.id
  LOOP
    PERFORM public.cancel_article_sale(v_sale_id);
  END LOOP;

  UPDATE public.article_assignments
  SET quantity_assigned = 0, status = 'ANNULLATA'
  WHERE article_id = p_article_id AND status = 'ATTIVA';

  UPDATE public.articles
  SET deleted_at = now(), deleted_reason = 'Eliminato dall''Archivio', updated_at = now()
  WHERE id = p_article_id;

  INSERT INTO public.movements(
    movement_type, reference_id, reference_code, article_id,
    total_amount_eur, description, operator_user_id, notes,
    change_before, change_after
  )
  VALUES(
    'ANNULLAMENTO', p_article_id, v_article.article_code, p_article_id,
    0, 'Articolo eliminato dall''Archivio', auth.uid(),
    'Ripristinabile dall''elenco movimenti con doppia conferma',
    v_snapshot, NULL
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_delete_article(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_article(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_restore_article(p_article_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_article public.articles%rowtype;
  v_delete_movement public.movements%rowtype;
  v_sale jsonb;
  v_assignment jsonb;
  v_credit public.credits%rowtype;
  v_reference text;
  v_status text;
  v_sold integer;
  v_original_status text;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Operazione non autorizzata'; END IF;

  SELECT * INTO v_article
  FROM public.articles
  WHERE id = p_article_id
  FOR UPDATE;

  IF v_article.id IS NULL THEN RAISE EXCEPTION 'Articolo non trovato'; END IF;
  IF v_article.deleted_at IS NULL THEN RAISE EXCEPTION 'L''articolo non risulta eliminato'; END IF;

  SELECT * INTO v_delete_movement
  FROM public.movements
  WHERE movement_type = 'ANNULLAMENTO'
    AND article_id = p_article_id
    AND description = 'Articolo eliminato dall''Archivio'
  ORDER BY movement_at DESC, id DESC
  LIMIT 1
  FOR UPDATE;

  IF v_delete_movement.id IS NULL OR v_delete_movement.change_before IS NULL THEN
    RAISE EXCEPTION 'Impossibile ripristinare: snapshot di eliminazione non disponibile';
  END IF;

  -- Se un credito generato dall'annullamento è già stato utilizzato,
  -- non si procede: altrimenti il ripristino altererebbe la contabilità storica.
  FOR v_sale IN SELECT value FROM jsonb_array_elements(COALESCE(v_delete_movement.change_before->'sales','[]'::jsonb))
  LOOP
    v_reference := v_sale->>'reference_code';
    IF v_reference IS NULL OR v_reference = '' THEN CONTINUE; END IF;
    IF EXISTS (
      SELECT 1 FROM public.credits c
      WHERE c.reason = 'Credito da annullamento vendita'
        AND c.notes ILIKE '%' || v_reference || '%'
        AND COALESCE(c.used_amount_eur,0) > 0
    ) THEN
      RAISE EXCEPTION 'Impossibile ripristinare: il credito collegato alla vendita % è già stato utilizzato', v_reference;
    END IF;
  END LOOP;

  v_original_status := COALESCE(v_delete_movement.change_before->'article'->>'status', 'IN_STOCK');

  UPDATE public.articles
  SET deleted_at = NULL,
      deleted_reason = NULL,
      status = v_original_status,
      updated_at = now()
  WHERE id = p_article_id;

  -- Ripristina le assegnazioni nello stato che avevano prima dell'eliminazione.
  FOR v_assignment IN SELECT value FROM jsonb_array_elements(COALESCE(v_delete_movement.change_before->'assignments','[]'::jsonb))
  LOOP
    UPDATE public.article_assignments
    SET quantity_assigned = COALESCE((v_assignment->>'quantity_assigned')::integer, 0),
        status = COALESCE(v_assignment->>'status', 'ANNULLATA'),
        notes = v_assignment->>'notes'
    WHERE id = (v_assignment->>'id')::uuid;
  END LOOP;

  -- Ripristina le vendite nello stato precedente.
  FOR v_sale IN SELECT value FROM jsonb_array_elements(COALESCE(v_delete_movement.change_before->'sales','[]'::jsonb))
  LOOP
    UPDATE public.movements
    SET quantity = NULLIF(v_sale->>'quantity','')::integer,
        total_amount_eur = NULLIF(v_sale->>'total_amount_eur','')::numeric,
        description = v_sale->>'description',
        notes = v_sale->>'notes'
    WHERE id = (v_sale->>'id')::uuid
      AND movement_type = 'VENDITA';

    -- I crediti creati dall'annullamento della vendita vengono annullati,
    -- senza cancellare il loro storico.
    v_reference := v_sale->>'reference_code';
    IF v_reference IS NOT NULL AND v_reference <> '' THEN
      FOR v_credit IN
        SELECT * FROM public.credits c
        WHERE c.reason = 'Credito da annullamento vendita'
          AND c.notes ILIKE '%' || v_reference || '%'
          AND COALESCE(c.used_amount_eur,0) = 0
          AND c.status <> 'ANNULLATO'
        FOR UPDATE
      LOOP
        UPDATE public.credits
        SET status = 'ANNULLATO'
        WHERE id = v_credit.id;
        INSERT INTO public.movements(
          mailbox_id, movement_type, reference_id, reference_code,
          total_amount_eur, description, operator_user_id, notes
        ) VALUES(
          v_credit.mailbox_id, 'STORNO', v_credit.id, v_credit.credit_code,
          v_credit.amount_eur,
          'Storno credito per ripristino vendita ' || v_reference,
          auth.uid(), 'Credito generato dall''annullamento poi annullato dal ripristino'
        );
      END LOOP;
    END IF;
  END LOOP;

  SELECT COALESCE(SUM(m.quantity),0)::integer INTO v_sold
  FROM public.movements m
  WHERE m.article_id = p_article_id
    AND m.movement_type = 'VENDITA'
    AND COALESCE(m.quantity,0) > 0
    AND NOT EXISTS (
      SELECT 1 FROM public.movements x
      WHERE x.movement_type = 'ANNULLAMENTO' AND x.reference_id = m.id
    );

  v_status := CASE
    WHEN v_sold >= v_article.quantity_purchased THEN 'VENDUTO'
    WHEN v_original_status = 'IN_ARRIVO' THEN 'IN_ARRIVO'
    ELSE 'IN_STOCK'
  END;

  UPDATE public.articles SET status = v_status, updated_at = now() WHERE id = p_article_id;

  INSERT INTO public.movements(
    movement_type, reference_id, reference_code, article_id,
    description, operator_user_id, notes
  ) VALUES(
    'MODIFICA', p_article_id, v_article.article_code, p_article_id,
    'Articolo ripristinato', auth.uid(),
    'Ripristino eseguito dall''elenco movimenti'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_restore_article(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_restore_article(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
