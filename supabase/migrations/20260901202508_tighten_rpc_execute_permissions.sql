REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.make_customer_code(text, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.my_mailbox_id() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.next_entity_code(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.register_article_arrival(uuid[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.register_article_sales(text, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_customer_code() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.make_customer_code(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_mailbox_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.next_entity_code(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.register_article_arrival(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.register_article_sales(text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_customer_code() TO authenticated;
