-- SHOPATUT: data di arrivo persistente e filtri archivio.
ALTER TABLE public.articles
  ADD COLUMN IF NOT EXISTS arrival_date date;

CREATE INDEX IF NOT EXISTS idx_articles_arrival_date
  ON public.articles(arrival_date);

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

  FOREACH aid IN ARRAY p_article_ids LOOP
    SELECT quantity_purchased
      INTO purchased
      FROM public.articles
     WHERE id = aid
     FOR UPDATE;

    IF purchased IS NULL THEN
      RAISE EXCEPTION 'Articolo non trovato: %', aid;
    END IF;

    SELECT COALESCE(SUM(quantity), 0)
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
  END LOOP;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.register_article_arrival(uuid[], date) TO authenticated;
