-- ShopATUT: stati logistici per assegnazione alla casella e visibilità cliente.
-- ATTIVA resta uno stato interno da verificare; IN_ARRIVO, IN_STOCK, IN_BOX e SPEDITO
-- vengono mostrati secondo lo stato esplicito dell'assegnazione, senza dedurlo dall'archivio.

ALTER TABLE public.article_assignments
  DROP CONSTRAINT IF EXISTS article_assignments_status_check;

ALTER TABLE public.article_assignments
  ADD CONSTRAINT article_assignments_status_check
  CHECK (status = ANY (ARRAY[
    'ATTIVA'::text,
    'IN_ARRIVO'::text,
    'IN_STOCK'::text,
    'IN_BOX'::text,
    'SPEDITO'::text,
    'ANNULLATA'::text
  ]));

DROP POLICY IF EXISTS articles_client_assigned ON public.articles;
DROP POLICY IF EXISTS customer_articles ON public.articles;
DROP POLICY IF EXISTS customer_incoming_articles ON public.articles;
DROP POLICY IF EXISTS articles_client_incoming ON public.articles;
CREATE POLICY articles_client_assigned
ON public.articles
FOR SELECT
TO authenticated
USING (
  deleted_at IS NULL
  AND EXISTS (
    SELECT 1
    FROM public.article_assignments aa
    WHERE aa.article_id = public.articles.id
      AND aa.mailbox_id = public.my_mailbox_id()
      AND aa.status IN ('ATTIVA', 'IN_ARRIVO', 'IN_STOCK', 'IN_BOX', 'SPEDITO')
      AND aa.quantity_assigned > 0
  )
);

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
  sold int;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Operazione non autorizzata';
  END IF;
  IF coalesce(array_length(p_article_ids, 1), 0) = 0 THEN
    RAISE EXCEPTION 'Nessun articolo selezionato';
  END IF;

  FOREACH aid IN ARRAY p_article_ids LOOP
    SELECT quantity_purchased
      INTO purchased
      FROM public.articles
     WHERE id = aid AND deleted_at IS NULL
     FOR UPDATE;

    IF purchased IS NULL THEN
      RAISE EXCEPTION 'Articolo non trovato: %', aid;
    END IF;

    SELECT COALESCE(SUM(mv.quantity), 0)
      INTO sold
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
           status = CASE WHEN sold >= purchased THEN 'VENDUTO' ELSE 'IN_STOCK' END,
           updated_at = now()
     WHERE id = aid;

    -- Aggiorna solo assegnazioni esplicitamente in arrivo. IN_BOX e SPEDITO restano invariati;
    -- ATTIVA non viene forzato a IN_STOCK perché resta da verificare.
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
