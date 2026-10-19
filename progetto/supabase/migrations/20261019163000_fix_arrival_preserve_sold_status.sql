-- ShopATUT: registrazione arrivo per articoli venduti/assegnati prima dell'arrivo fisico.
-- Lo stato dell'articolo in archivio resta unico; lo stato logistico dell'assegnazione
-- alla casella è indipendente e viene aggiornato soltanto se è ancora IN_ARRIVO.
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
  sold integer;
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
     WHERE id = aid
       AND deleted_at IS NULL
     FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Articolo non trovato: %', aid;
    END IF;

    -- Quantità impegnate da assegnazioni attive, comprese quelle già SPEDITO.
    -- Le vendite con casella sono già rappresentate dalle assegnazioni: qui si
    -- aggiungono soltanto le vendite occasionali senza mailbox, evitando doppi conteggi.
    SELECT GREATEST(
             COALESCE(v_article.legacy_sold, 0),
             COALESCE((
               SELECT SUM(aa.quantity_assigned)
                 FROM public.article_assignments aa
                WHERE aa.article_id = aid
                  AND aa.quantity_assigned > 0
                  AND aa.status IN ('ATTIVA', 'IN_ARRIVO', 'IN_STOCK', 'IN_BOX', 'SPEDITO')
             ), 0)
             + COALESCE((
               SELECT SUM(mv.quantity)
                 FROM public.movements mv
                WHERE mv.movement_type = 'VENDITA'
                  AND mv.article_id = aid
                  AND mv.mailbox_id IS NULL
                  AND (
                    NULLIF(BTRIM(mv.generic_customer_name), '') IS NOT NULL
                    OR NULLIF(BTRIM(mv.customer_name), '') IS NOT NULL
                  )
                  AND NOT EXISTS (
                    SELECT 1
                      FROM public.movements x
                     WHERE x.movement_type = 'ANNULLAMENTO'
                       AND x.reference_id = mv.id
                  )
             ), 0)
           )
      INTO sold;

    -- La data viene registrata anche se lo stato globale è già VENDUTO.
    -- Se era già presente una data, una registrazione ripetuta non la sovrascrive.
    -- Non riaprire articoli già VENDUTO: la disponibilità residua può essere zero
    -- anche quando i movimenti storici non ricostruiscono interamente la vendita.
    UPDATE public.articles AS a
       SET arrival_date = COALESCE(a.arrival_date, p_arrival_date, CURRENT_DATE),
           status = CASE
             WHEN v_article.status = 'VENDUTO'
               OR sold >= v_article.quantity_purchased THEN 'VENDUTO'
             ELSE 'IN_STOCK'
           END,
           updated_at = now()
     WHERE a.id = aid;

    -- Aggiorna solo assegnazioni ancora in attesa dell'arrivo fisico.
    -- IN_BOX, SPEDITO e gli altri stati già avanzati restano invariati.
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
