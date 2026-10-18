-- Identificativo canonico cliente: public.customers.customer_code.
-- mailbox_id resta una relazione tecnica; il codice duplicato della casella viene eliminato.
-- Questa migrazione va applicata solo insieme alla versione applicativa che usa customer_code.

-- 1) Rimuovi il generatore/trigger che valorizzava il codice duplicato.
DROP TRIGGER IF EXISTS trg_set_mailbox_code ON public.mailboxes;

-- 2) Mantieni le informazioni storiche, sostituendo il vecchio codice con quello cliente.
UPDATE public.movements AS mv
SET generic_customer_name = CASE
      WHEN mv.generic_customer_name IS NULL
        OR btrim(mv.generic_customer_name) = ''
        OR mv.generic_customer_name = mb.mailbox_code
      THEN c.customer_code
      ELSE mv.generic_customer_name
    END,
    customer_name = CASE
      WHEN mv.customer_name IS NULL
        OR btrim(mv.customer_name) = ''
        OR mv.customer_name = mb.mailbox_code
      THEN c.customer_code
      ELSE mv.customer_name
    END,
    reference_code = CASE
      WHEN mv.reference_code IS NULL
        OR btrim(mv.reference_code) = ''
        OR mv.reference_code = mb.mailbox_code
      THEN c.customer_code
      ELSE mv.reference_code
    END
FROM public.mailboxes AS mb
JOIN public.customers AS c ON c.id = mb.customer_id
WHERE mv.mailbox_id = mb.id;

-- 3) Il codice cliente viene garantito per tutti i record preesistenti e futuri.
-- La generazione è sequenziale per evitare collisioni tra righe senza codice.
DO $migration$
DECLARE
  r record;
  v_letters text;
  v_prefix text;
  v_base text;
  v_candidate text;
  v_suffix integer;
BEGIN
  FOR r IN
    SELECT id, last_name, created_at
    FROM public.customers
    WHERE customer_code IS NULL OR btrim(customer_code) = ''
    ORDER BY created_at, id
  LOOP
    v_letters := regexp_replace(upper(coalesce(r.last_name, '')), '[^A-Z0-9]', '', 'g');
    v_letters := left(rpad(v_letters, 3, 'X'), 3);
    v_prefix := to_char(coalesce(r.created_at, now()), 'YYMM');
    v_base := v_prefix || v_letters;
    v_candidate := v_base;
    v_suffix := 0;

    WHILE EXISTS (
      SELECT 1 FROM public.customers
      WHERE upper(customer_code) = v_candidate AND id <> r.id
    ) LOOP
      v_suffix := v_suffix + 1;
      v_candidate := v_prefix || left(v_letters, greatest(0, 3 - length(v_suffix::text))) || v_suffix::text;
      IF length(v_candidate) < 7 THEN
        v_candidate := v_candidate || repeat('X', 7 - length(v_candidate));
      END IF;
    END LOOP;

    UPDATE public.customers
    SET customer_code = v_candidate, updated_at = now()
    WHERE id = r.id;
  END LOOP;
END;
$migration$;

ALTER TABLE public.customers ALTER COLUMN customer_code SET NOT NULL;

-- 4) RPC per creare un cliente con casella: restituisce sempre il codice cliente canonico.
CREATE OR REPLACE FUNCTION public.admin_create_customer_mailbox(
  p_email text,
  p_first_name text,
  p_last_name text,
  p_notes text DEFAULT NULL,
  p_opened_at date DEFAULT CURRENT_DATE,
  p_phone text DEFAULT NULL,
  p_shipping_address text DEFAULT NULL,
  p_shipping_city text DEFAULT NULL,
  p_shipping_country text DEFAULT NULL,
  p_shipping_postal_code text DEFAULT NULL,
  p_status text DEFAULT 'ATTIVA'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_customer_id uuid;
  v_customer_code text;
  v_mailbox_id uuid;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Operazione non autorizzata';
  END IF;
  IF btrim(coalesce(p_first_name, '')) = '' OR btrim(coalesce(p_last_name, '')) = '' THEN
    RAISE EXCEPTION 'Nome e cognome sono obbligatori';
  END IF;
  IF p_status NOT IN ('ATTIVA', 'SOSPESA', 'CHIUSA') THEN
    RAISE EXCEPTION 'Stato casella non valido';
  END IF;

  INSERT INTO public.customers(
    first_name, last_name, phone, email,
    shipping_address, shipping_city, shipping_postal_code, shipping_country
  ) VALUES (
    btrim(p_first_name), btrim(p_last_name), nullif(btrim(p_phone), ''),
    nullif(btrim(p_email), ''), nullif(btrim(p_shipping_address), ''),
    nullif(btrim(p_shipping_city), ''), nullif(btrim(p_shipping_postal_code), ''),
    nullif(btrim(p_shipping_country), '')
  ) RETURNING id, customer_code INTO v_customer_id, v_customer_code;

  INSERT INTO public.mailboxes(customer_id, status, opened_at, notes)
  VALUES (v_customer_id, p_status, coalesce(p_opened_at, current_date), nullif(btrim(p_notes), ''))
  RETURNING id INTO v_mailbox_id;

  INSERT INTO public.movements(mailbox_id, movement_type, reference_id, reference_code, description, operator_user_id)
  VALUES (v_mailbox_id, 'NUOVO_UTENTE', v_customer_id, v_customer_code, 'Nuovo cliente creato', auth.uid());

  RETURN jsonb_build_object(
    'customer_id', v_customer_id,
    'customer_code', v_customer_code,
    'mailbox_id', v_mailbox_id
  );
END;
$function$;

-- 5) Crea/collega la casella all'utente Auth senza generare un secondo codice.
CREATE OR REPLACE FUNCTION public.admin_create_mailbox_for_auth_user(
  p_user_id uuid,
  p_status text DEFAULT 'ATTIVA',
  p_opened_at date DEFAULT CURRENT_DATE,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_customer_id uuid;
  v_customer_code text;
  v_mailbox_id uuid;
  v_email text;
  v_first_name text;
  v_last_name text;
  v_phone text;
  v_shipping_address text;
  v_shipping_postal_code text;
  v_shipping_city text;
  v_shipping_country text;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Operazione non autorizzata';
  END IF;
  IF p_status NOT IN ('ATTIVA', 'SOSPESA', 'CHIUSA') THEN
    RAISE EXCEPTION 'Stato casella non valido';
  END IF;

  SELECT
    u.email,
    nullif(btrim(coalesce(u.raw_user_meta_data ->> 'first_name', '')), ''),
    nullif(btrim(coalesce(u.raw_user_meta_data ->> 'last_name', '')), ''),
    nullif(btrim(coalesce(u.raw_user_meta_data ->> 'phone', '')), ''),
    nullif(btrim(coalesce(u.raw_user_meta_data ->> 'shipping_address', '')), ''),
    nullif(btrim(coalesce(u.raw_user_meta_data ->> 'shipping_postal_code', '')), ''),
    nullif(btrim(coalesce(u.raw_user_meta_data ->> 'shipping_city', '')), ''),
    nullif(btrim(coalesce(u.raw_user_meta_data ->> 'shipping_country', '')), '')
  INTO v_email, v_first_name, v_last_name, v_phone, v_shipping_address,
       v_shipping_postal_code, v_shipping_city, v_shipping_country
  FROM auth.users AS u
  WHERE u.id = p_user_id;

  IF v_email IS NULL THEN
    RAISE EXCEPTION 'Utente Auth non trovato';
  END IF;

  SELECT customer_id INTO v_customer_id
  FROM public.profiles
  WHERE user_id = p_user_id
  LIMIT 1;

  IF v_customer_id IS NULL THEN
    IF v_first_name IS NULL OR v_last_name IS NULL THEN
      RAISE EXCEPTION 'Profilo cliente non trovato per l''utente Auth e nome/cognome non disponibili';
    END IF;

    INSERT INTO public.customers(
      first_name, last_name, email, phone,
      shipping_address, shipping_postal_code, shipping_city, shipping_country
    ) VALUES (
      v_first_name, v_last_name, v_email, v_phone,
      v_shipping_address, v_shipping_postal_code, v_shipping_city, v_shipping_country
    ) RETURNING id, customer_code INTO v_customer_id, v_customer_code;

    INSERT INTO public.profiles(user_id, role, customer_id, mailbox_id, display_name)
    VALUES (p_user_id, 'CLIENTE', v_customer_id, NULL, concat(v_first_name, ' ', v_last_name));
  ELSE
    SELECT customer_code INTO v_customer_code
    FROM public.customers
    WHERE id = v_customer_id;
  END IF;

  SELECT id INTO v_mailbox_id
  FROM public.mailboxes
  WHERE customer_id = v_customer_id
  LIMIT 1;

  IF v_mailbox_id IS NULL THEN
    INSERT INTO public.mailboxes(customer_id, status, opened_at, notes)
    VALUES (v_customer_id, p_status, coalesce(p_opened_at, current_date), nullif(btrim(p_notes), ''))
    RETURNING id INTO v_mailbox_id;

    INSERT INTO public.movements(mailbox_id, movement_type, reference_id, reference_code, description, operator_user_id)
    VALUES (v_mailbox_id, 'NUOVO_UTENTE', v_customer_id, v_customer_code, 'Nuovo cliente e casella creati', auth.uid());
  END IF;

  UPDATE public.profiles
  SET mailbox_id = v_mailbox_id, updated_at = now()
  WHERE user_id = p_user_id;

  RETURN jsonb_build_object(
    'customer_id', v_customer_id,
    'customer_code', v_customer_code,
    'mailbox_id', v_mailbox_id
  );
END;
$function$;

-- 6) La cancellazione conserva il codice cliente nello storico.
CREATE OR REPLACE FUNCTION public.admin_delete_customer(p_customer_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_mailbox_ids uuid[];
  v_user_ids uuid[];
  v_customer_code text;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Operazione non autorizzata'; END IF;
  IF p_customer_id IS NULL THEN RAISE EXCEPTION 'Cliente non valido'; END IF;

  SELECT customer_code INTO v_customer_code
  FROM public.customers WHERE id = p_customer_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cliente non trovato'; END IF;

  SELECT coalesce(array_agg(id), ARRAY[]::uuid[]) INTO v_mailbox_ids
  FROM public.mailboxes WHERE customer_id = p_customer_id;

  UPDATE public.movements AS mv
  SET generic_customer_name = CASE
        WHEN mv.generic_customer_name IS NULL OR btrim(mv.generic_customer_name) = '' THEN v_customer_code
        ELSE mv.generic_customer_name
      END,
      customer_name = CASE
        WHEN mv.customer_name IS NULL OR btrim(mv.customer_name) = '' THEN v_customer_code
        ELSE mv.customer_name
      END,
      reference_code = CASE
        WHEN mv.reference_code IS NULL OR btrim(mv.reference_code) = '' THEN v_customer_code
        ELSE mv.reference_code
      END,
      mailbox_id = NULL
  WHERE mv.mailbox_id = ANY(v_mailbox_ids);

  IF EXISTS (SELECT 1 FROM public.payments WHERE mailbox_id = ANY(v_mailbox_ids)) THEN RAISE EXCEPTION 'Impossibile cancellare il cliente: esistono pagamenti associati'; END IF;
  IF EXISTS (SELECT 1 FROM public.credits WHERE mailbox_id = ANY(v_mailbox_ids)) THEN RAISE EXCEPTION 'Impossibile cancellare il cliente: esistono crediti associati'; END IF;
  IF EXISTS (SELECT 1 FROM public.article_assignments WHERE mailbox_id = ANY(v_mailbox_ids)) THEN RAISE EXCEPTION 'Impossibile cancellare il cliente: esistono articoli assegnati'; END IF;
  IF EXISTS (SELECT 1 FROM public.shipment_items WHERE mailbox_id = ANY(v_mailbox_ids)) THEN RAISE EXCEPTION 'Impossibile cancellare il cliente: esistono articoli in spedizioni'; END IF;
  IF EXISTS (SELECT 1 FROM public.shipments WHERE mailbox_id = ANY(v_mailbox_ids)) THEN RAISE EXCEPTION 'Impossibile cancellare il cliente: esistono spedizioni associate'; END IF;

  SELECT coalesce(array_agg(user_id), ARRAY[]::uuid[]) INTO v_user_ids
  FROM public.profiles
  WHERE customer_id = p_customer_id OR mailbox_id = ANY(v_mailbox_ids);

  DELETE FROM public.profiles WHERE customer_id = p_customer_id OR mailbox_id = ANY(v_mailbox_ids);
  DELETE FROM public.mailboxes WHERE customer_id = p_customer_id;
  DELETE FROM public.customers WHERE id = p_customer_id;

  DELETE FROM public.movements
  WHERE reference_id = p_customer_id
    AND movement_type = 'ANNULLAMENTO'
    AND description = 'Cliente cancellato'
    AND mailbox_id IS NULL;

  IF array_length(v_user_ids, 1) IS NOT NULL THEN
    DELETE FROM auth.users WHERE id = ANY(v_user_ids);
  END IF;
END;
$function$;

-- 7) Le vendite ricevono esclusivamente customer_code; la casella si risolve tramite customer_id.
CREATE OR REPLACE FUNCTION public.register_article_sales(
  p_customer_code text,
  p_lines jsonb,
  p_movement_date date DEFAULT CURRENT_DATE
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Operazione non autorizzata'; END IF;
  IF nullif(btrim(p_customer_code), '') IS NULL THEN RAISE EXCEPTION 'Codice cliente obbligatorio'; END IF;

  SELECT c.id INTO v_customer_id
  FROM public.customers AS c
  WHERE upper(c.customer_code) = upper(btrim(p_customer_code))
  LIMIT 1;
  IF v_customer_id IS NULL THEN RAISE EXCEPTION 'Codice cliente non trovato: %', p_customer_code; END IF;

  SELECT m.id INTO v_mailbox_id
  FROM public.mailboxes AS m
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

    SELECT a.quantity_purchased - coalesce((
      SELECT sum(mv.quantity)
      FROM public.movements AS mv
      WHERE mv.article_id = a.id
        AND mv.movement_type = 'VENDITA'
        AND coalesce(mv.quantity, 0) > 0
        AND NOT EXISTS (
          SELECT 1 FROM public.movements AS x
          WHERE x.movement_type = 'ANNULLAMENTO' AND x.reference_id = mv.id
        )
    ), 0)
    INTO v_available
    FROM public.articles AS a
    WHERE a.id = v_article_id AND a.deleted_at IS NULL
    FOR UPDATE;

    IF v_available IS NULL THEN RAISE EXCEPTION 'Articolo non trovato o già eliminato: %', v_article_id; END IF;
    IF v_qty > v_available THEN RAISE EXCEPTION 'Quantità non disponibile per articolo %: residua %', v_article_id, v_available; END IF;
  END LOOP;

  FOR v_line IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
    v_article_id := (v_line ->> 'article_id')::uuid;
    v_qty := (v_line ->> 'quantity')::integer;
    v_price := (v_line ->> 'price')::numeric;
    v_total := round(v_qty * v_price, 2);

    IF v_mailbox_id IS NOT NULL THEN
      SELECT id, quantity_assigned INTO v_assignment_id, v_existing
      FROM public.article_assignments
      WHERE article_id = v_article_id AND mailbox_id = v_mailbox_id AND status = 'ATTIVA'
      ORDER BY assigned_at ASC, id ASC
      LIMIT 1 FOR UPDATE;

      IF v_assignment_id IS NULL THEN
        INSERT INTO public.article_assignments(article_id, mailbox_id, quantity_assigned, status, notes)
        VALUES (v_article_id, v_mailbox_id, v_qty, 'ATTIVA', 'Assegnazione da vendita')
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
    ) VALUES (
      v_mailbox_id, 'VENDITA', v_article_id, v_qty, v_price, v_total,
      upper(btrim(p_customer_code)), upper(btrim(p_customer_code)),
      CASE WHEN v_mailbox_id IS NULL THEN 'Vendita articolo - cliente senza casella' ELSE 'Vendita articolo' END,
      auth.uid(), coalesce(p_movement_date, current_date)::timestamptz
    );

    SELECT a.quantity_purchased - coalesce((
      SELECT sum(mv.quantity)
      FROM public.movements AS mv
      WHERE mv.article_id = a.id
        AND mv.movement_type = 'VENDITA'
        AND NOT EXISTS (
          SELECT 1 FROM public.movements AS x
          WHERE x.movement_type = 'ANNULLAMENTO' AND x.reference_id = mv.id
        )
    ), 0)
    INTO v_remaining
    FROM public.articles AS a WHERE a.id = v_article_id;

    UPDATE public.articles
    SET status = CASE
      WHEN v_remaining <= 0 THEN 'VENDUTO'
      WHEN status = 'IN_ARRIVO' THEN 'IN_ARRIVO'
      ELSE 'IN_STOCK'
    END,
    updated_at = now()
    WHERE id = v_article_id;
  END LOOP;
END;
$function$;

-- 8) Audit: lo storico cliente riporta sempre customer_code, mai un secondo codice.
CREATE OR REPLACE FUNCTION public.audit_entity_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
  v_mailbox_id uuid;
  v_reference_code text;
  v_type text;
  v_description text;
BEGIN
  v_id := coalesce(NEW.id, OLD.id);

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
    v_reference_code := coalesce(NEW.customer_code, OLD.customer_code);
    SELECT m.id INTO v_mailbox_id
    FROM public.mailboxes AS m
    WHERE m.customer_id = v_id
    ORDER BY m.created_at ASC, m.id ASC
    LIMIT 1;
  ELSIF TG_TABLE_NAME = 'articles' THEN
    v_reference_code := coalesce(NEW.article_code, OLD.article_code);
  ELSIF TG_TABLE_NAME = 'payments' THEN
    v_mailbox_id := coalesce(NEW.mailbox_id, OLD.mailbox_id);
    v_reference_code := coalesce(NEW.payment_code, OLD.payment_code);
  ELSIF TG_TABLE_NAME = 'shipments' THEN
    v_mailbox_id := coalesce(NEW.mailbox_id, OLD.mailbox_id);
    v_reference_code := coalesce(NEW.shipment_code, OLD.shipment_code);
  ELSIF TG_TABLE_NAME = 'credits' THEN
    v_mailbox_id := coalesce(NEW.mailbox_id, OLD.mailbox_id);
    v_reference_code := coalesce(NEW.credit_code, OLD.credit_code);
  END IF;

  INSERT INTO public.movements(
    mailbox_id, movement_type, reference_id, reference_code,
    article_id, description, operator_user_id, movement_at
  ) VALUES (
    v_mailbox_id, v_type, v_id, v_reference_code,
    CASE WHEN TG_TABLE_NAME = 'articles' AND TG_OP <> 'DELETE' THEN v_id ELSE NULL END,
    v_description, auth.uid(), now()
  );

  RETURN coalesce(NEW, OLD);
END;
$function$;

-- 9) The legacy dashboard RPC now exposes customer_code as the only identifier.
DROP FUNCTION IF EXISTS public.customer_dashboard_summary();
CREATE FUNCTION public.customer_dashboard_summary()
RETURNS TABLE (
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
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
  WITH me AS (
    SELECT p.customer_id, p.mailbox_id
    FROM public.profiles AS p
    WHERE p.user_id = (SELECT auth.uid())
    LIMIT 1
  ),
  c AS (
    SELECT c.* FROM public.customers AS c JOIN me ON me.customer_id = c.id
  ),
  m AS (
    SELECT m.* FROM public.mailboxes AS m JOIN me ON me.mailbox_id = m.id
  ),
  assignments AS (
    SELECT aa.article_id, aa.quantity_assigned
    FROM public.article_assignments AS aa JOIN me ON me.mailbox_id = aa.mailbox_id
    WHERE aa.status = 'ATTIVA'
  ),
  stock AS (
    SELECT
      coalesce(sum(CASE WHEN a.status = 'IN_STOCK' THEN aa.quantity_assigned ELSE 0 END), 0) AS in_stock,
      coalesce(sum(CASE WHEN a.status = 'IN_ARRIVO' THEN aa.quantity_assigned ELSE 0 END), 0) AS in_arrivo
    FROM assignments AS aa JOIN public.articles AS a ON a.id = aa.article_id
  ),
  balance AS (
    SELECT coalesce(sum(mv.total_amount_eur), 0) AS balance_eur
    FROM public.movements AS mv JOIN me ON me.mailbox_id = mv.mailbox_id
  ),
  recent AS (
    SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.movement_at DESC, x.id DESC), '[]'::jsonb) AS recent_movements
    FROM (
      SELECT mv.id, mv.movement_code, mv.movement_type, mv.total_amount_eur, mv.movement_at, mv.description
      FROM public.movements AS mv JOIN me ON me.mailbox_id = mv.mailbox_id
      ORDER BY mv.movement_at DESC NULLS LAST, mv.id DESC
      LIMIT 5
    ) AS x
  )
  SELECT c.id, c.first_name, c.last_name, c.email, c.phone,
    c.shipping_address, c.shipping_city, c.shipping_postal_code, c.shipping_country,
    c.created_at, m.id, c.customer_code::text, m.status::text,
    b.balance_eur, s.in_stock, s.in_arrivo, r.recent_movements
  FROM c LEFT JOIN m ON true CROSS JOIN balance AS b CROSS JOIN stock AS s CROSS JOIN recent AS r;
$function$;
REVOKE ALL ON FUNCTION public.customer_dashboard_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.customer_dashboard_summary() TO authenticated;

-- 10) Mantiene il flusso di registrazione attivo: cliente senza casella automatica.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_customer_id uuid;
  v_first_name text;
  v_last_name text;
  v_phone text;
  v_shipping_address text;
  v_shipping_postal_code text;
  v_shipping_city text;
  v_shipping_country text;
BEGIN
  v_first_name := nullif(btrim(coalesce(NEW.raw_user_meta_data ->> 'first_name', '')), '');
  v_last_name := nullif(btrim(coalesce(NEW.raw_user_meta_data ->> 'last_name', '')), '');
  v_phone := nullif(btrim(coalesce(NEW.raw_user_meta_data ->> 'phone', '')), '');
  v_shipping_address := nullif(btrim(coalesce(NEW.raw_user_meta_data ->> 'shipping_address', '')), '');
  v_shipping_postal_code := nullif(btrim(coalesce(NEW.raw_user_meta_data ->> 'shipping_postal_code', '')), '');
  v_shipping_city := nullif(btrim(coalesce(NEW.raw_user_meta_data ->> 'shipping_city', '')), '');
  v_shipping_country := nullif(btrim(coalesce(NEW.raw_user_meta_data ->> 'shipping_country', '')), '');

  IF v_first_name IS NULL OR v_last_name IS NULL THEN
    RAISE EXCEPTION 'Registrazione cliente incompleta: nome e cognome sono obbligatori';
  END IF;

  INSERT INTO public.customers(
    first_name, last_name, email, phone,
    shipping_address, shipping_postal_code, shipping_city, shipping_country
  ) VALUES (
    v_first_name, v_last_name, NEW.email, v_phone,
    v_shipping_address, v_shipping_postal_code, v_shipping_city, v_shipping_country
  ) RETURNING id INTO v_customer_id;

  INSERT INTO public.profiles(user_id, role, customer_id, mailbox_id, display_name)
  VALUES (NEW.id, 'CLIENTE', v_customer_id, NULL, concat(v_first_name, ' ', v_last_name));

  RETURN NEW;
END;
$function$;

-- 11) The customer code is the only editable/public customer identifier.
CREATE OR REPLACE FUNCTION public.admin_update_customer_code(p_customer_id uuid, p_customer_code text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_code text := upper(btrim(coalesce(p_customer_code, '')));
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Operazione non autorizzata'; END IF;
  IF p_customer_id IS NULL THEN RAISE EXCEPTION 'Cliente non valido'; END IF;
  IF v_code = '' THEN RAISE EXCEPTION 'Il codice cliente è obbligatorio'; END IF;
  IF length(v_code) < 3 OR length(v_code) > 20 THEN RAISE EXCEPTION 'Il codice cliente deve contenere da 3 a 20 caratteri'; END IF;
  IF v_code !~ '^[A-Z0-9]+$' THEN RAISE EXCEPTION 'Il codice cliente può contenere solo lettere e numeri, senza spazi'; END IF;
  IF EXISTS (SELECT 1 FROM public.customers WHERE upper(customer_code) = v_code AND id <> p_customer_id) THEN
    RAISE EXCEPTION 'Il codice cliente % è già utilizzato', v_code;
  END IF;

  UPDATE public.customers
  SET customer_code = v_code, updated_at = now()
  WHERE id = p_customer_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cliente non trovato'; END IF;
  RETURN v_code;
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_update_customer_code(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_customer_code(uuid, text) TO authenticated;

-- 12) Elimina le API e il campo del vecchio identificativo duplicato.
DROP FUNCTION IF EXISTS public.admin_update_mailbox_code(uuid, text);
DROP FUNCTION IF EXISTS public.generate_mailbox_code(text, text);
DROP FUNCTION IF EXISTS public.set_mailbox_code();
ALTER TABLE public.mailboxes DROP COLUMN IF EXISTS mailbox_code;
