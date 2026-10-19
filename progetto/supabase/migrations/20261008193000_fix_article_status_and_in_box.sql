-- SHOPATÜT - stato articolo e stato di gestione IN BOX
-- Applicare al progetto Supabase associato a SHOPATÜT.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'article_assignments_status_check'
      AND conrelid = 'public.article_assignments'::regclass
  ) THEN
    ALTER TABLE public.article_assignments
      ADD CONSTRAINT article_assignments_status_check
      CHECK (status IN ('ATTIVA','IN_BOX','CHIUSA'));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.register_article_sales(
  p_customer_code text,
  p_lines jsonb,
  p_movement_date date DEFAULT CURRENT_DATE
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

  SELECT c.id INTO v_customer_id
  FROM public.customers c
  WHERE upper(c.customer_code) = upper(btrim(p_customer_code))
  LIMIT 1;
  IF v_customer_id IS NULL THEN RAISE EXCEPTION 'Codice cliente non trovato: %', p_customer_code; END IF;

  SELECT m.id INTO v_mailbox_id
  FROM public.mailboxes m
  WHERE m.customer_id = v_customer_id
  LIMIT 1;

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

GRANT EXECUTE ON FUNCTION public.register_article_sales(text,jsonb,date) TO authenticated;


CREATE OR REPLACE FUNCTION public.admin_update_customer_sale(
  p_movement_id uuid,
  p_movement_date date,
  p_quantity integer,
  p_unit_price_eur numeric,
  p_notes text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_old public.movements%ROWTYPE;
  v_assignment public.article_assignments%ROWTYPE;
  v_article public.articles%ROWTYPE;
  v_allocated numeric := 0;
  v_current_assigned integer := 0;
  v_new_total integer;
  v_shipped integer := 0;
  v_before jsonb;
  v_after jsonb;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Operazione non autorizzata'; END IF;
  IF p_quantity IS NULL OR p_quantity<=0 THEN RAISE EXCEPTION 'Quantità non valida'; END IF;
  IF p_unit_price_eur IS NULL OR p_unit_price_eur<=0 THEN RAISE EXCEPTION 'Prezzo unitario non valido'; END IF;

  SELECT * INTO v_old FROM public.movements
  WHERE id=p_movement_id AND movement_type='VENDITA' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Vendita non trovata'; END IF;
  IF v_old.article_id IS NULL OR v_old.mailbox_id IS NULL THEN RAISE EXCEPTION 'Vendita non modificabile'; END IF;

  SELECT * INTO v_article FROM public.articles WHERE id=v_old.article_id FOR UPDATE;
  SELECT * INTO v_assignment
  FROM public.article_assignments
  WHERE article_id=v_old.article_id
    AND mailbox_id=v_old.mailbox_id
    AND status IN ('ATTIVA','IN_BOX')
  ORDER BY assigned_at ASC,id ASC
  LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Assegnazione attiva non trovata'; END IF;

  SELECT coalesce(sum(quantity_assigned),0)
  INTO v_current_assigned
  FROM public.article_assignments
  WHERE article_id=v_old.article_id
    AND mailbox_id=v_old.mailbox_id
    AND status IN ('ATTIVA','IN_BOX');

  SELECT coalesce(sum(si.quantity_shipped),0)
  INTO v_shipped
  FROM public.shipment_items si
  JOIN public.shipments s ON s.id=si.shipment_id
  WHERE si.article_id=v_old.article_id
    AND si.mailbox_id=v_old.mailbox_id
    AND s.status<>'ANNULLATA';

  IF v_current_assigned-v_old.quantity+p_quantity<v_shipped THEN
    RAISE EXCEPTION 'La quantità non può essere inferiore a quella già spedita';
  END IF;

  v_new_total:=v_current_assigned-v_old.quantity+p_quantity;
  IF v_new_total>v_article.quantity_purchased THEN
    RAISE EXCEPTION 'Quantità superiore a quella acquistata';
  END IF;

  SELECT coalesce(sum(pa.amount_eur),0)
  INTO v_allocated
  FROM public.payment_allocations pa
  WHERE pa.movement_id=p_movement_id;
  IF p_quantity*p_unit_price_eur<v_allocated THEN
    RAISE EXCEPTION 'Il nuovo importo è inferiore al pagamento già attribuito (%)',v_allocated;
  END IF;

  v_before:=jsonb_build_object(
    'date',v_old.movement_at::date,'quantity',v_old.quantity,
    'unit_price_eur',v_old.unit_price_eur,'total_amount_eur',v_old.total_amount_eur,
    'notes',v_old.notes
  );

  UPDATE public.movements
  SET movement_at=coalesce(p_movement_date,current_date)::timestamptz,
      quantity=p_quantity,unit_price_eur=round(p_unit_price_eur,2),
      total_amount_eur=round(p_quantity*p_unit_price_eur,2),
      notes=nullif(btrim(p_notes),'')
  WHERE id=p_movement_id;

  UPDATE public.article_assignments
  SET quantity_assigned=quantity_assigned-v_old.quantity+p_quantity,
      notes=nullif(btrim(p_notes),'')
  WHERE id=v_assignment.id;

  UPDATE public.articles
  SET status = CASE
    WHEN v_article.status='IN_ARRIVO' THEN 'IN_ARRIVO'
    WHEN v_new_total>=quantity_purchased THEN 'VENDUTO'
    ELSE 'IN_STOCK'
  END,
  updated_at=now()
  WHERE id=v_old.article_id;

  SELECT jsonb_build_object(
    'date',movement_at::date,'quantity',quantity,
    'unit_price_eur',unit_price_eur,'total_amount_eur',total_amount_eur,'notes',notes
  ) INTO v_after
  FROM public.movements WHERE id=p_movement_id;

  INSERT INTO public.movements(
    mailbox_id,movement_type,reference_id,reference_code,article_id,
    description,operator_user_id,notes,change_before,change_after
  )
  VALUES(
    v_old.mailbox_id,'MODIFICA',v_old.id,v_old.reference_code,v_old.article_id,
    'Vendita articolo modificata',auth.uid(),v_old.reference_code,v_before,v_after
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.admin_update_customer_sale(uuid,date,integer,numeric,text) TO authenticated;


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
      AND aa.status IN ('ATTIVA','IN_BOX')
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Assegnazione non trovata o non gestibile: %',v_id;
    END IF;

    SELECT a.status INTO v_article_status
    FROM public.articles a
    WHERE a.id=v_assignment.article_id
      AND a.deleted_at IS NULL
    FOR UPDATE;

    IF v_article_status NOT IN ('IN_STOCK','VENDUTO') THEN
      RAISE EXCEPTION 'L''articolo % non è ancora arrivato (stato %).',v_id,coalesce(v_article_status,'—');
    END IF;

    SELECT coalesce(sum(si.quantity_shipped),0)
    INTO v_shipped
    FROM public.shipment_items si
    JOIN public.shipments s ON s.id=si.shipment_id
    WHERE si.article_id=v_assignment.article_id
      AND si.mailbox_id=v_assignment.mailbox_id
      AND s.status<>'ANNULLATA';

    IF v_shipped>0 THEN
      RAISE EXCEPTION 'L''articolo % ha già quantità spedita e non può essere portato in BOX.',v_id;
    END IF;

    IF v_assignment.status<>'IN_BOX' THEN
      UPDATE public.article_assignments
      SET status='IN_BOX'
      WHERE id=v_id;
      v_count:=v_count+1;
    END IF;
  END LOOP;

  RETURN v_count;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_mark_customer_articles_in_box(uuid[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_mark_customer_articles_in_box(uuid[]) TO authenticated;


CREATE OR REPLACE FUNCTION public.customer_dashboard_summary()
RETURNS TABLE(
  customer_id uuid,
  customer_first_name text,
  customer_last_name text,
  customer_email text,
  customer_phone text,
  shipping_address text,
  shipping_city text,
  shipping_postal_code text,
  shipping_country text,
  customer_created_at timestamptz,
  mailbox_id uuid,
  customer_code text,
  mailbox_status text,
  balance_eur numeric,
  in_stock numeric,
  in_arrivo numeric,
  recent_movements jsonb
)
LANGUAGE sql
SET search_path TO 'public'
AS $function$
  WITH me AS (
    SELECT p.customer_id,p.mailbox_id
    FROM public.profiles p
    WHERE p.user_id=(SELECT auth.uid())
    LIMIT 1
  ),
  c AS (
    SELECT c.* FROM public.customers c JOIN me ON me.customer_id=c.id
  ),
  m AS (
    SELECT m.* FROM public.mailboxes m JOIN me ON me.mailbox_id=m.id
  ),
  assignments AS (
    SELECT aa.article_id,aa.quantity_assigned
    FROM public.article_assignments aa
    JOIN me ON me.mailbox_id=aa.mailbox_id
    WHERE aa.status IN ('ATTIVA','IN_BOX')
  ),
  stock AS (
    SELECT
      coalesce(sum(CASE WHEN a.status IN ('IN_STOCK','VENDUTO') THEN aa.quantity_assigned ELSE 0 END),0) AS in_stock,
      coalesce(sum(CASE WHEN a.status='IN_ARRIVO' THEN aa.quantity_assigned ELSE 0 END),0) AS in_arrivo
    FROM assignments aa
    JOIN public.articles a ON a.id=aa.article_id
  ),
  balance AS (
    SELECT coalesce(sum(mv.total_amount_eur),0) AS balance_eur
    FROM public.movements mv JOIN me ON me.mailbox_id=mv.mailbox_id
  ),
  recent AS (
    SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.movement_at DESC,x.id DESC),'[]'::jsonb) AS recent_movements
    FROM (
      SELECT mv.id,mv.movement_code,mv.movement_type,mv.total_amount_eur,mv.movement_at,mv.description
      FROM public.movements mv JOIN me ON me.mailbox_id=mv.mailbox_id
      ORDER BY mv.movement_at DESC NULLS LAST,mv.id DESC
      LIMIT 5
    ) x
  )
  SELECT
    c.id,c.first_name,c.last_name,c.email,c.phone,
    c.shipping_address,c.shipping_city,c.shipping_postal_code,c.shipping_country,
    c.created_at,m.id,c.customer_code::text,m.status::text,
    b.balance_eur,s.in_stock,s.in_arrivo,r.recent_movements
  FROM c
  LEFT JOIN m ON true
  CROSS JOIN balance b
  CROSS JOIN stock s
  CROSS JOIN recent r;
$function$;

NOTIFY pgrST,'reload schema';
