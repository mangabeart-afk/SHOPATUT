-- SHOPATÜT - stati articoli nella casella cliente
-- IN ARRIVO / IN STOCK derivano dallo stato dell'archivio.
-- IN BOX deriva da article_assignments.status.
-- SPEDITO deriva dai record di shipment_items.

DROP POLICY IF EXISTS articles_client_assigned ON public.articles;

CREATE POLICY articles_client_assigned
ON public.articles
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.article_assignments aa
    WHERE aa.article_id = public.articles.id
      AND aa.mailbox_id = public.my_mailbox_id()
      AND aa.status IN ('ATTIVA', 'IN_BOX')
  )
);

DROP POLICY IF EXISTS articles_client_incoming ON public.articles;

CREATE POLICY articles_client_incoming
ON public.articles
FOR SELECT
TO authenticated
USING (
  status = 'IN_ARRIVO'
  AND deleted_at IS NULL
);
