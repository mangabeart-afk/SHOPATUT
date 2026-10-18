-- Ripristina la RPC richiesta dalla cancellazione multipla dell'archivio articoli.
-- La firma e il nome del parametro devono coincidere con supabase.rpc('admin_delete_articles', { p_article_ids: ids }).
CREATE OR REPLACE FUNCTION public.admin_delete_articles(p_article_ids uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  PERFORM 1 FROM public.articles a WHERE a.id = ANY(p_article_ids) FOR UPDATE;

  FOR v_sale_id IN
    SELECT m.id FROM public.movements m
    WHERE m.article_id = ANY(p_article_ids) AND m.movement_type = 'VENDITA'
    ORDER BY m.movement_at ASC NULLS LAST, m.id ASC
  LOOP
    PERFORM public.admin_delete_customer_sale(v_sale_id);
  END LOOP;

  DELETE FROM public.payment_allocations pa
  USING public.movements m
  WHERE pa.movement_id = m.id AND m.article_id = ANY(p_article_ids);

  DELETE FROM public.shipment_items si
  USING public.shipments s
  WHERE si.shipment_id = s.id AND si.article_id = ANY(p_article_ids) AND s.status = 'ANNULLATA';

  DELETE FROM public.article_assignments WHERE article_id = ANY(p_article_ids);

  DELETE FROM public.movements
  WHERE article_id = ANY(p_article_ids) AND movement_type IN ('ARTICOLO', 'MODIFICA');

  UPDATE public.movements SET article_id = NULL WHERE article_id = ANY(p_article_ids);
  DELETE FROM public.articles WHERE id = ANY(p_article_ids);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_delete_articles(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_articles(uuid[]) TO authenticated;
NOTIFY pgrst, 'reload schema';
