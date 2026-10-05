CREATE OR REPLACE FUNCTION public.customer_dashboard_recent_photo_articles_v2()
RETURNS TABLE (
  id uuid,
  article_code text,
  series text,
  detail text,
  photo_url text,
  created_at timestamptz,
  status text,
  origin text
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
    a.photo_url,
    a.created_at,
    a.status,
    a.origin
  FROM public.articles AS a
  WHERE a.deleted_at IS NULL
    AND a.photo_url IS NOT NULL
    AND btrim(a.photo_url) <> ''
  ORDER BY a.created_at DESC, a.id DESC
  LIMIT 12;
END;
$function$;

REVOKE ALL ON FUNCTION public.customer_dashboard_recent_photo_articles_v2() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.customer_dashboard_recent_photo_articles_v2() TO authenticated;
