REVOKE ALL ON FUNCTION public.customer_dashboard_recent_photo_articles_v2() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.customer_dashboard_recent_photo_articles_v2() TO authenticated;
