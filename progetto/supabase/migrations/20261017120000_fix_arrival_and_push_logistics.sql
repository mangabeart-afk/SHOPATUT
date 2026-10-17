-- ShopATUT v38: considera le vendite storiche importate quando si registra un arrivo.
-- Le quantità vendute nell'archivio sono composte da vendite legacy + movimenti non annullati.
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
  purchased int;
  legacy_sold int;
  movement_sold int;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Operazione non autorizzata';
  END IF;
  IF coalesce(array_length(p_article_ids, 1), 0) = 0 THEN
    RAISE EXCEPTION 'Nessun articolo selezionato';
  END IF;

  FOREACH aid IN ARRAY p_article_ids LOOP
    SELECT quantity_purchased, COALESCE(legacy_quantity_sold, 0)
      INTO purchased, legacy_sold
      FROM public.articles
     WHERE id = aid AND deleted_at IS NULL
     FOR UPDATE;

    IF purchased IS NULL THEN
      RAISE EXCEPTION 'Articolo non trovato: %', aid;
    END IF;

    SELECT COALESCE(SUM(mv.quantity), 0)
      INTO movement_sold
      FROM public.movements mv
     WHERE mv.movement_type = 'VENDITA'
       AND mv.article_id = aid
       AND NOT EXISTS (
         SELECT 1
           FROM public.movements x
          WHERE x.movement_type = 'ANNULLAMENTO'
            AND x.reference_id = mv.id
       );

    UPDATE public.articles
       SET arrival_date = COALESCE(p_arrival_date, CURRENT_DATE),
           status = CASE WHEN legacy_sold + movement_sold >= purchased THEN 'VENDUTO' ELSE 'IN_STOCK' END,
           updated_at = now()
     WHERE id = aid;

    -- Soltanto le assegnazioni esplicitamente IN_ARRIVO passano a IN_STOCK.
    -- Le quantità assegnate restano separate dallo stato aggregato dell'archivio.
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
NOTIFY pgrst, 'reload schema';
