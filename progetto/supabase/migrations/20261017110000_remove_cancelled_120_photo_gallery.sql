-- Vista con 120 articoli paginati annullata: la dashboard mostra solo gli ultimi 12.
DROP FUNCTION IF EXISTS public.customer_dashboard_recent_photo_articles_120();
NOTIFY pgrst, 'reload schema';
