DROP POLICY IF EXISTS customer_articles ON public.articles;
CREATE POLICY customer_articles ON public.articles
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.article_assignments aa
      WHERE aa.article_id = public.articles.id
        AND aa.mailbox_id = public.my_mailbox_id()
        AND aa.status = 'ATTIVA'
    )
  );

REVOKE EXECUTE ON FUNCTION public.is_admin() FROM anon;
REVOKE EXECUTE ON FUNCTION public.make_customer_code(text, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.my_mailbox_id() FROM anon;
REVOKE EXECUTE ON FUNCTION public.next_entity_code(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.register_article_arrival(uuid[]) FROM anon;
REVOKE EXECUTE ON FUNCTION public.register_article_sales(text, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.set_customer_code() FROM anon;

GRANT EXECUTE ON FUNCTION public.register_article_arrival(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.register_article_sales(text, jsonb) TO authenticated;
