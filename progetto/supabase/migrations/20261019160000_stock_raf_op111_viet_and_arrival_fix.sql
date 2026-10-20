-- Registra l'arrivo anche per articoli venduti/assegnati prima dell'arrivo fisico.
-- Lo stato archivio resta VENDUTO quando tutte le unità sono già vendute/assegnate;
-- le assegnazioni SPEDITO e IN_BOX non vengono riportate indietro.
CREATE OR REPLACE FUNCTION public.register_article_arrival(
  p_article_ids uuid[],
  p_arrival_date date DEFAULT CURRENT_DATE
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  aid uuid;
  v_article record;
  v_sold integer := 0;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Operazione non autorizzata';
  END IF;
  IF coalesce(array_length(p_article_ids, 1), 0) = 0 THEN
    RAISE EXCEPTION 'Nessun articolo selezionato';
  END IF;

  FOREACH aid IN ARRAY p_article_ids LOOP
    SELECT id, quantity_purchased,
           COALESCE(legacy_quantity_sold, 0) AS legacy_sold,
           status, arrival_date
      INTO v_article
      FROM public.articles
     WHERE id = aid AND deleted_at IS NULL
     FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Articolo non trovato: %', aid;
    END IF;

    IF v_article.status <> 'IN_ARRIVO'
       AND NOT (v_article.status = 'VENDUTO' AND v_article.arrival_date IS NULL) THEN
      CONTINUE;
    END IF;

    SELECT GREATEST(
      COALESCE(v_article.legacy_sold, 0),
      COALESCE((
        SELECT SUM(mv.quantity)
        FROM public.movements mv
        WHERE mv.article_id = aid AND mv.movement_type = 'VENDITA'
          AND NOT EXISTS (
            SELECT 1 FROM public.movements x
            WHERE x.movement_type = 'ANNULLAMENTO' AND x.reference_id = mv.id
          )
      ), 0),
      COALESCE((
        SELECT SUM(aa.quantity_assigned)
        FROM public.article_assignments aa
        WHERE aa.article_id = aid
          AND aa.status IN ('ATTIVA','IN_ARRIVO','IN_STOCK','IN_BOX','SPEDITO')
          AND aa.quantity_assigned > 0
      ), 0)
    ) INTO v_sold;

    UPDATE public.articles
       SET arrival_date = COALESCE(p_arrival_date, CURRENT_DATE),
           status = CASE
             WHEN v_sold >= COALESCE(v_article.quantity_purchased, 0) THEN 'VENDUTO'
             ELSE 'IN_STOCK'
           END,
           updated_at = now()
     WHERE id = aid;

    UPDATE public.article_assignments
       SET status = 'IN_STOCK'
     WHERE article_id = aid
       AND status = 'IN_ARRIVO'
       AND quantity_assigned > 0;
  END LOOP;
END;
$function$;

REVOKE ALL ON FUNCTION public.register_article_arrival(uuid[], date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_article_arrival(uuid[], date) TO authenticated;

-- Allinea la pagina articoli utente agli stati dell'assegnazione.
-- Ripristina anche due righe di preordine di 2604PCL come vendite collegate agli articoli;
-- gli ID dei movimenti restano invariati, così gli abbinamenti dei pagamenti sono preservati.

CREATE OR REPLACE FUNCTION public.admin_mark_customer_articles_in_box(
  p_assignment_ids uuid[]
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_id uuid;
  v_count integer := 0;
  v_assignment public.article_assignments%ROWTYPE;
  v_shipped integer;
  v_article_status text;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Operazione non autorizzata'; END IF;
  IF coalesce(array_length(p_assignment_ids,1),0)=0 THEN
    RAISE EXCEPTION 'Nessun articolo selezionato';
  END IF;

  FOREACH v_id IN ARRAY p_assignment_ids LOOP
    SELECT aa.* INTO v_assignment
    FROM public.article_assignments aa
    WHERE aa.id=v_id
      AND aa.status IN ('ATTIVA','IN_STOCK','IN_BOX')
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Assegnazione non trovata o non gestibile: %',v_id; END IF;

    SELECT a.status INTO v_article_status
    FROM public.articles a
    WHERE a.id=v_assignment.article_id AND a.deleted_at IS NULL
    FOR UPDATE;

    IF v_article_status NOT IN ('IN_STOCK','VENDUTO') THEN
      RAISE EXCEPTION 'L''articolo % non è ancora arrivato (stato %).',v_id,coalesce(v_article_status,'—');
    END IF;

    SELECT coalesce(sum(si.quantity_shipped),0) INTO v_shipped
    FROM public.shipment_items si
    JOIN public.shipments s ON s.id=si.shipment_id
    WHERE si.article_id=v_assignment.article_id
      AND si.mailbox_id=v_assignment.mailbox_id
      AND s.status<>'ANNULLATA';

    IF v_shipped>0 THEN
      RAISE EXCEPTION 'L''articolo % ha già quantità spedita e non può essere portato in BOX.',v_id;
    END IF;

    IF v_assignment.status<>'IN_BOX' THEN
      UPDATE public.article_assignments SET status='IN_BOX' WHERE id=v_id;
      v_count:=v_count+1;
    END IF;
  END LOOP;
  RETURN v_count;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_mark_customer_articles_in_box(uuid[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_mark_customer_articles_in_box(uuid[]) TO authenticated;

DO $migration$
DECLARE
  v_mailbox_id uuid;
  v_article_111_id uuid;
  v_article_110_id uuid;
  v_active_qty integer;
  v_original_id uuid;
  v_stock_article_id uuid;
  v_original_qty integer;
  v_unit_cost numeric;
BEGIN

  -- Scorpora la copia personale RAF dall'articolo da 5 copie.
  -- Quattro copie restano assegnate ai clienti (IN ARRIVO); una copia diventa stock interno.
  SELECT a.id, a.quantity_purchased, a.unit_cost_eur
    INTO v_original_id, v_original_qty, v_unit_cost
    FROM public.articles a
   WHERE a.article_code='A26/0509'
     AND a.import_sheet='X' AND a.import_row=14
     AND a.deleted_at IS NULL
   FOR UPDATE;

  IF v_original_id IS NULL THEN
    RAISE EXCEPTION 'Articolo sorgente A26/0509 (X!14) non trovato; scorporo RAF annullato.';
  END IF;

  SELECT a.id INTO v_stock_article_id
    FROM public.articles a
   WHERE a.article_code='A26/1161' AND a.deleted_at IS NULL;

  IF v_stock_article_id IS NULL THEN
    IF v_original_qty NOT IN (4,5) THEN
      RAISE EXCEPTION 'Quantità inattesa su A26/0509 (%). Non scorporo la copia RAF per evitare incoerenze.', v_original_qty;
    END IF;

    INSERT INTO public.articles (
      article_code, purchase_date, origin, seller, series, detail,
      quantity_purchased, currency, unit_price_foreign, exchange_rate,
      accessory_cost_eur, total_cost_eur, unit_cost_eur, notes,
      created_at, updated_at, status, photo_url,
      commission_cost, commission_mode, commission_percent, commission_currency, commission_exchange_rate,
      customs_cost, customs_mode, customs_percent, customs_currency, customs_exchange_rate,
      shipping_cost, shipping_mode, shipping_percent, shipping_currency, shipping_exchange_rate,
      deleted_at, deleted_reason, article_type, arrival_date,
      import_sheet, import_row, legacy_quantity_sold, legacy_sales_revenue_eur, purchase_source
    )
    SELECT
      'A26/1161', a.purchase_date, a.origin, a.seller, a.series,
      '111 VIET - COPIA PERSONALE RAF',
      1, a.currency, a.unit_price_foreign, a.exchange_rate,
      0, COALESCE(a.unit_cost_eur, 40), COALESCE(a.unit_cost_eur, 40),
      concat_ws(' ', a.notes, 'Scorporo da X!14: copia personale RAF, scorta interna IN STOCK; nessuna vendita e nessuna assegnazione cliente.'),
      a.created_at, now(), 'IN_STOCK', a.photo_url,
      0, a.commission_mode, a.commission_percent, a.commission_currency, a.commission_exchange_rate,
      0, a.customs_mode, a.customs_percent, a.customs_currency, a.customs_exchange_rate,
      0, a.shipping_mode, a.shipping_percent, a.shipping_currency, a.shipping_exchange_rate,
      NULL, NULL, a.article_type, NULL,
      'X', NULL, 0, 0, a.purchase_source
    FROM public.articles a
    WHERE a.id = v_original_id;

    UPDATE public.articles
       SET quantity_purchased = 4,
           total_cost_eur = round(COALESCE(v_unit_cost, 40) * 4, 2),
           status = 'IN_ARRIVO',
           notes = concat_ws(' ', notes, 'Scorporo X!14: 4 copie clienti IN ARRIVO; copia personale RAF trasferita ad A26/1161 IN STOCK.'),
           updated_at = now()
     WHERE id = v_original_id;
  ELSE
    -- Rende ripetibile la migrazione, ma blocca un eventuale codice A26/1161 estraneo.
    IF NOT EXISTS (
      SELECT 1 FROM public.articles a
       WHERE a.id = v_stock_article_id
         AND a.series = 'ONE PIECE'
         AND a.detail = '111 VIET - COPIA PERSONALE RAF'
         AND a.quantity_purchased = 1
    ) THEN
      RAISE EXCEPTION 'A26/1161 esiste ma non corrisponde alla copia personale RAF; nessuna sovrascrittura eseguita.';
    END IF;
    IF v_original_qty <> 4 THEN
      RAISE EXCEPTION 'A26/0509 dovrebbe contenere 4 copie dopo lo scorporo, ne contiene %.', v_original_qty;
    END IF;
  END IF;

  -- Riserva A26/1161 come stock effettivamente disponibile, senza assegnarlo a una casella.
  UPDATE public.articles
     SET status='IN_STOCK', quantity_purchased=1,
         total_cost_eur=round(COALESCE(unit_cost_eur, 40), 2),
         legacy_quantity_sold=0, legacy_sales_revenue_eur=0,
         updated_at=now()
   WHERE article_code='A26/1161' AND deleted_at IS NULL;

  -- Evita che il prossimo articolo generato riutilizzi il codice A26/1161.
  INSERT INTO public.number_counters(entity_code, year_2, last_number)
  VALUES ('A', 26, 1161)
  ON CONFLICT DO UPDATE
     SET last_number = GREATEST(public.number_counters.last_number, EXCLUDED.last_number);


  SELECT m.id INTO v_mailbox_id
  FROM public.mailboxes m
  JOIN public.customers c ON c.id=m.customer_id
  WHERE c.customer_code='2604PCL';

  SELECT a.id INTO v_article_111_id
  FROM public.articles a
  WHERE a.article_code='A26/0509' AND a.import_sheet='X' AND a.import_row=14 AND a.deleted_at IS NULL;

  SELECT a.id INTO v_article_110_id
  FROM public.articles a
  WHERE a.article_code='A26/0508' AND a.deleted_at IS NULL;

  IF v_mailbox_id IS NOT NULL AND v_article_111_id IS NOT NULL THEN
    SELECT COALESCE(SUM(aa.quantity_assigned),0) INTO v_active_qty
    FROM public.article_assignments aa
    WHERE aa.article_id=v_article_111_id
      AND aa.status IN ('ATTIVA','IN_ARRIVO','IN_STOCK','IN_BOX','SPEDITO');

    IF NOT EXISTS (
      SELECT 1 FROM public.article_assignments aa
      WHERE aa.article_id=v_article_111_id AND aa.mailbox_id=v_mailbox_id
        AND aa.status IN ('ATTIVA','IN_ARRIVO','IN_STOCK','IN_BOX','SPEDITO')
    ) THEN
      IF v_active_qty < (SELECT a.quantity_purchased FROM public.articles a WHERE a.id=v_article_111_id) THEN
        INSERT INTO public.article_assignments(article_id,mailbox_id,quantity_assigned,status,assigned_at,notes)
        VALUES(v_article_111_id,v_mailbox_id,1,'IN_ARRIVO',now(),
          'Excel 2604PCL riga 7; OP 111 VIET €50 pagato il 16-giu; articolo sorgente X!14 (A26/0509); stato IN ARRIVO.');
      ELSE
        RAISE EXCEPTION 'Capacità esaurita per A26/0509: assegnazione 2604PCL non inserita.';
      END IF;
    END IF;

    UPDATE public.movements mv
    SET movement_type='VENDITA', article_id=v_article_111_id, quantity=1,
        unit_price_eur=50, total_amount_eur=50,
        description='ONE PIECE 111 VIET',
        notes=concat_ws(' ',mv.notes,'Riconciliato con Excel 2604PCL riga 7 e X!14; pagamento P26/0075 mantenuto.')
    WHERE mv.movement_code='M26/0198' AND mv.mailbox_id=v_mailbox_id
      AND mv.total_amount_eur=50;

    -- La vendita da 50 € era già inclusa nei campi legacy dell'articolo X!14.
    -- Ora è rappresentata dal movimento M26/0198: azzera il duplicato legacy.
    IF FOUND THEN
      UPDATE public.articles
         SET legacy_quantity_sold=0,
             legacy_sales_revenue_eur=0,
             updated_at=now()
       WHERE id=v_article_111_id;
    END IF;
  END IF;

  IF v_mailbox_id IS NOT NULL AND v_article_110_id IS NOT NULL THEN
    UPDATE public.movements mv
    SET movement_type='VENDITA', article_id=v_article_110_id, quantity=1,
        unit_price_eur=32, total_amount_eur=32,
        description='ONE PIECE 110 VIET',
        notes=concat_ws(' ',mv.notes,'Riconciliato con Excel 2604PCL riga 6; pagamento P26/0074 mantenuto.')
    WHERE mv.movement_code='M26/0196' AND mv.mailbox_id=v_mailbox_id
      AND mv.total_amount_eur=32;
  END IF;
END;
$migration$;

NOTIFY pgrst, 'reload schema';
