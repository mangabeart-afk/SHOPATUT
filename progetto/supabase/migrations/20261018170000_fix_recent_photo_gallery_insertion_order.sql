-- Dashboard utente: ultimi 12 articoli con foto, ordinati per inserimento effettivo.
-- purchase_date non deve influenzare l'ordine. Per righe importate con created_at identico,
-- usa la parte numerica finale del codice articolo come spareggio stabile e coerente con la sequenza.
CREATE OR REPLACE FUNCTION public.customer_dashboard_recent_photo_articles_v2()
RETURNS TABLE (
  id uuid,
  article_code text,
  series text,
  detail text,
  origin text,
  photo_url text,
  created_at timestamptz,
  status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Autenticazione richiesta';
  END IF;

  RETURN QUERY
  SELECT
    a.id,
    a.article_code,
    a.series,
    a.detail,
    a.origin,
    a.photo_url,
    a.created_at,
    a.status
  FROM public.articles AS a
  WHERE a.deleted_at IS NULL
    AND a.photo_url IS NOT NULL
    AND btrim(a.photo_url) <> ''
  ORDER BY
    a.created_at DESC,
    NULLIF(substring(a.article_code FROM '([0-9]+)$'), '')::bigint DESC NULLS LAST,
    a.article_code DESC,
    a.id DESC
  LIMIT 12;
END;
$function$;

REVOKE ALL ON FUNCTION public.customer_dashboard_recent_photo_articles_v2() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.customer_dashboard_recent_photo_articles_v2() TO authenticated;
