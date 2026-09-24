-- Restore the RPCs used by the current admin UI and add safe customer deletion.

CREATE OR REPLACE FUNCTION public.admin_update_mailbox_code(
  p_mailbox_id uuid,
  p_mailbox_code text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code text := upper(btrim(coalesce(p_mailbox_code, '')));
  v_existing_id uuid;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Operazione non autorizzata'; END IF;
  IF p_mailbox_id IS NULL THEN RAISE EXCEPTION 'Casella non valida'; END IF;
  IF v_code = '' THEN RAISE EXCEPTION 'Il codice cliente è obbligatorio'; END IF;
  IF length(v_code) < 3 OR length(v_code) > 20 THEN RAISE EXCEPTION 'Il codice cliente deve contenere da 3 a 20 caratteri'; END IF;
  IF v_code !~ '^[A-Z0-9]+$' THEN RAISE EXCEPTION 'Il codice cliente può contenere solo lettere e numeri, senza spazi'; END IF;

  SELECT id INTO v_existing_id
  FROM public.mailboxes
  WHERE upper(mailbox_code) = v_code AND id <> p_mailbox_id
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    RAISE EXCEPTION 'Il codice cliente % è già utilizzato', v_code;
  END IF;

  UPDATE public.mailboxes SET mailbox_code = v_code WHERE id = p_mailbox_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Casella non trovata'; END IF;
  RETURN v_code;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_update_mailbox_code(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_mailbox_code(uuid, text) TO authenticated;

DROP FUNCTION IF EXISTS public.register_article_sales(text, jsonb);
CREATE OR REPLACE FUNCTION public.register_article_sales(
  p_customer_code text,
  p_lines jsonb,
  p_movement_date date DEFAULT CURRENT_DATE
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mailbox_id uuid;
  v_line jsonb;
  v_article_id uuid;
  v_qty integer;
  v_price numeric;
  v_available integer;
  v_total numeric;
  v_remaining integer;
  v_existing integer;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Operazione non autorizzata'; END IF;
  SELECT id INTO v_mailbox_id FROM public.mailboxes WHERE upper(mailbox_code) = upper(btrim(p_customer_code));
  IF v_mailbox_id IS NULL THEN RAISE EXCEPTION 'Codice casella non trovato: %', p_customer_code; END IF;
  IF p_lines IS NULL OR jsonb_array_length(p_lines) = 0 THEN RAISE EXCEPTION 'Nessun articolo selezionato'; END IF;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    v_article_id := (v_line->>'article_id')::uuid;
    v_qty := (v_line->>'quantity')::integer;
    v_price := (v_line->>'price')::numeric;
    IF v_qty <= 0 OR v_price <= 0 THEN RAISE EXCEPTION 'Quantità e prezzo devono essere maggiori di zero'; END IF;

    SELECT a.quantity_purchased - coalesce((SELECT sum(m.quantity) FROM public.movements m WHERE m.article_id = a.id AND m.movement_type = 'VENDITA'), 0)
      INTO v_available
      FROM public.articles a
      WHERE a.id = v_article_id
      FOR UPDATE;

    IF v_available IS NULL THEN RAISE EXCEPTION 'Articolo non trovato: %', v_article_id; END IF;
    IF v_qty > v_available THEN RAISE EXCEPTION 'Quantità non disponibile per articolo %: residua %', v_article_id, v_available; END IF;

    v_total := v_qty * v_price;
    INSERT INTO public.movements(
      mailbox_id, movement_type, article_id, quantity, unit_price_eur,
      total_amount_eur, generic_customer_name, description, operator_user_id, movement_at
    ) VALUES (
      v_mailbox_id, 'VENDITA', v_article_id, v_qty, v_price, v_total,
      p_customer_code, 'Vendita articolo', auth.uid(), p_movement_date::timestamptz
    );

    SELECT coalesce(sum(aa.quantity_assigned), 0) INTO v_existing
    FROM public.article_assignments aa
    WHERE aa.article_id = v_article_id
      AND aa.mailbox_id = v_mailbox_id
      AND aa.status = 'ATTIVA';

    IF v_existing = 0 THEN
      INSERT INTO public.article_assignments(article_id, mailbox_id, quantity_assigned, status, notes)
      VALUES(v_article_id, v_mailbox_id, v_qty, 'ATTIVA', 'Assegnazione da vendita');
    ELSE
      UPDATE public.article_assignments
      SET quantity_assigned = quantity_assigned + v_qty
      WHERE id = (
        SELECT id FROM public.article_assignments
        WHERE article_id = v_article_id AND mailbox_id = v_mailbox_id AND status = 'ATTIVA'
        ORDER BY assigned_at ASC, id ASC
        LIMIT 1
      );
    END IF;

    v_remaining := v_available - v_qty;
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
$$;

GRANT EXECUTE ON FUNCTION public.register_article_sales(text, jsonb, date) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_delete_customer(p_customer_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mailbox_ids uuid[];
  v_user_ids uuid[];
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Operazione non autorizzata'; END IF;
  IF p_customer_id IS NULL THEN RAISE EXCEPTION 'Cliente non valido'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.customers WHERE id = p_customer_id) THEN RAISE EXCEPTION 'Cliente non trovato'; END IF;

  SELECT coalesce(array_agg(id), ARRAY[]::uuid[]) INTO v_mailbox_ids
  FROM public.mailboxes WHERE customer_id = p_customer_id;

  IF EXISTS (SELECT 1 FROM public.movements WHERE mailbox_id = ANY(v_mailbox_ids)) THEN RAISE EXCEPTION 'Impossibile cancellare il cliente: esistono movimenti storici associati'; END IF;
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

  -- No previous history exists (checked above). Remove the transient audit row
  -- generated by the customer DELETE trigger.
  DELETE FROM public.movements
  WHERE reference_id = p_customer_id
    AND movement_type = 'ANNULLAMENTO'
    AND description = 'Cliente cancellato'
    AND mailbox_id IS NULL;

  IF array_length(v_user_ids, 1) IS NOT NULL THEN
    DELETE FROM auth.users WHERE id = ANY(v_user_ids);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_delete_customer(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_customer(uuid) TO authenticated;

NOTIFY pgrST, 'reload schema';
