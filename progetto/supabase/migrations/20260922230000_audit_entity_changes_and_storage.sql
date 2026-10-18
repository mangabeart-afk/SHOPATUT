-- Audit CRUD changes in the customer movement ledger.
-- Existing application code already records INSERT events; these triggers add
-- UPDATE/DELETE events so the movement list also documents edits and cancellations.

CREATE OR REPLACE FUNCTION public.audit_entity_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_mailbox_id uuid;
  v_reference_code text;
  v_type text;
  v_description text;
BEGIN
  v_id := COALESCE(NEW.id, OLD.id);

  IF TG_OP = 'DELETE' THEN
    v_type := 'ANNULLAMENTO';
    v_description := CASE TG_TABLE_NAME
      WHEN 'customers' THEN 'Cliente cancellato'
      WHEN 'articles' THEN 'Articolo cancellato'
      WHEN 'payments' THEN 'Pagamento cancellato'
      WHEN 'shipments' THEN 'Spedizione cancellata'
      WHEN 'credits' THEN 'Credito cancellato'
      ELSE 'Record cancellato'
    END;
  ELSE
    v_type := 'MODIFICA';
    v_description := CASE TG_TABLE_NAME
      WHEN 'customers' THEN 'Dati cliente modificati'
      WHEN 'articles' THEN 'Articolo modificato'
      WHEN 'payments' THEN 'Pagamento modificato'
      WHEN 'shipments' THEN 'Spedizione modificata'
      WHEN 'credits' THEN 'Credito modificato'
      ELSE 'Record modificato'
    END;
  END IF;

  IF TG_TABLE_NAME = 'customers' THEN
    SELECT m.id, m.mailbox_code INTO v_mailbox_id, v_reference_code
    FROM public.mailboxes m
    WHERE m.customer_id = v_id
    ORDER BY m.created_at ASC, m.id ASC
    LIMIT 1;
  ELSIF TG_TABLE_NAME = 'articles' THEN
    v_reference_code := COALESCE(NEW.article_code, OLD.article_code);
  ELSIF TG_TABLE_NAME = 'payments' THEN
    v_mailbox_id := COALESCE(NEW.mailbox_id, OLD.mailbox_id);
    v_reference_code := COALESCE(NEW.payment_code, OLD.payment_code);
  ELSIF TG_TABLE_NAME = 'shipments' THEN
    v_mailbox_id := COALESCE(NEW.mailbox_id, OLD.mailbox_id);
    v_reference_code := COALESCE(NEW.shipment_code, OLD.shipment_code);
  ELSIF TG_TABLE_NAME = 'credits' THEN
    v_mailbox_id := COALESCE(NEW.mailbox_id, OLD.mailbox_id);
    v_reference_code := COALESCE(NEW.credit_code, OLD.credit_code);
  END IF;

  INSERT INTO public.movements(
    mailbox_id, movement_type, reference_id, reference_code,
    article_id, description, operator_user_id, movement_at
  )
  VALUES(
    v_mailbox_id,
    v_type,
    v_id,
    v_reference_code,
    CASE WHEN TG_TABLE_NAME = 'articles' THEN v_id ELSE NULL END,
    v_description,
    auth.uid(),
    now()
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS audit_customers_change ON public.customers;
CREATE TRIGGER audit_customers_change
AFTER UPDATE OR DELETE ON public.customers
FOR EACH ROW EXECUTE FUNCTION public.audit_entity_change();

DROP TRIGGER IF EXISTS audit_articles_change ON public.articles;
CREATE TRIGGER audit_articles_change
AFTER UPDATE OR DELETE ON public.articles
FOR EACH ROW EXECUTE FUNCTION public.audit_entity_change();

DROP TRIGGER IF EXISTS audit_payments_change ON public.payments;
CREATE TRIGGER audit_payments_change
AFTER UPDATE OR DELETE ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.audit_entity_change();

DROP TRIGGER IF EXISTS audit_shipments_change ON public.shipments;
CREATE TRIGGER audit_shipments_change
AFTER UPDATE OR DELETE ON public.shipments
FOR EACH ROW EXECUTE FUNCTION public.audit_entity_change();

DROP TRIGGER IF EXISTS audit_credits_change ON public.credits;
CREATE TRIGGER audit_credits_change
AFTER UPDATE OR DELETE ON public.credits
FOR EACH ROW EXECUTE FUNCTION public.audit_entity_change();

-- Keep the photo bucket available and explicitly public for article images.
INSERT INTO storage.buckets (id, name, public)
VALUES ('article-photos', 'article-photos', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS article_photos_admin_insert ON storage.objects;
CREATE POLICY article_photos_admin_insert ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'article-photos' AND public.is_admin());

DROP POLICY IF EXISTS article_photos_admin_update ON storage.objects;
CREATE POLICY article_photos_admin_update ON storage.objects
FOR UPDATE TO authenticated
USING (bucket_id = 'article-photos' AND public.is_admin())
WITH CHECK (bucket_id = 'article-photos' AND public.is_admin());

DROP POLICY IF EXISTS article_photos_admin_delete ON storage.objects;
CREATE POLICY article_photos_admin_delete ON storage.objects
FOR DELETE TO authenticated
USING (bucket_id = 'article-photos' AND public.is_admin());

DROP POLICY IF EXISTS article_photos_public_read ON storage.objects;
CREATE POLICY article_photos_public_read ON storage.objects
FOR SELECT TO public
USING (bucket_id = 'article-photos');

NOTIFY pgrst, 'reload schema';
