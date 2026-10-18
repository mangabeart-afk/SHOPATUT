-- ShopATUT v38: registrazione arrivi sicura e idempotente.
-- Evita transizioni duplicate e doppi conteggi tra vendite legacy e movimenti.

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
  sold int;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Operazione non autorizzata';
  END IF;
  IF coalesce(array_length(p_article_ids, 1), 0) = 0 THEN
    RAISE EXCEPTION 'Nessun articolo selezionato';
  END IF;

  FOREACH aid IN ARRAY p_article_ids LOOP
    SELECT id, quantity_purchased, COALESCE(legacy_quantity_sold, 0) AS legacy_sold, status
      INTO v_article
      FROM public.articles
     WHERE id = aid AND deleted_at IS NULL
     FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Articolo non trovato: %', aid;
    END IF;

    -- La funzione processa soltanto transizioni reali dall'archivio IN_ARRIVO.
    IF v_article.status <> 'IN_ARRIVO' THEN
      CONTINUE;
    END IF;

    -- Le vendite importate possono comparire anche nei movimenti dettagliati.
    -- GREATEST evita un doppio conteggio quando le due fonti descrivono le stesse vendite.
    SELECT GREATEST(
             COALESCE(v_article.legacy_sold, 0),
             COALESCE(SUM(mv.quantity), 0)
           )
      INTO sold
      FROM public.movements mv
     WHERE mv.movement_type = 'VENDITA'
       AND mv.article_id = aid
       AND NOT EXISTS (
         SELECT 1 FROM public.movements x
          WHERE x.movement_type = 'ANNULLAMENTO'
            AND x.reference_id = mv.id
       );

    UPDATE public.articles
       SET arrival_date = COALESCE(p_arrival_date, CURRENT_DATE),
           status = CASE WHEN sold >= v_article.quantity_purchased THEN 'VENDUTO' ELSE 'IN_STOCK' END,
           updated_at = now()
     WHERE id = aid;

    -- Solo le assegnazioni in arrivo diventano disponibili; IN_BOX/SPEDITO restano invariati.
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
REVOKE ALL ON FUNCTION public.register_article_arrival(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_article_arrival(uuid[]) TO authenticated;

NOTIFY pgrst, 'reload schema';
