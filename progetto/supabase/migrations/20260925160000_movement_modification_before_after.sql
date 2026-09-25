-- Store complete before/after snapshots for MODIFICA movements.
ALTER TABLE public.movements
  ADD COLUMN IF NOT EXISTS change_before jsonb,
  ADD COLUMN IF NOT EXISTS change_after jsonb;

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
  v_before jsonb;
  v_after jsonb;
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
      ELSE 'Record cancellato' END;
  ELSE
    v_type := 'MODIFICA';
    v_description := CASE TG_TABLE_NAME
      WHEN 'customers' THEN 'Dati cliente modificati'
      WHEN 'articles' THEN 'Articolo modificato'
      WHEN 'payments' THEN 'Pagamento modificato'
      WHEN 'shipments' THEN 'Spedizione modificata'
      WHEN 'credits' THEN 'Credito modificato'
      ELSE 'Record modificato' END;
  END IF;
  IF TG_TABLE_NAME = 'customers' THEN
    SELECT m.id, m.mailbox_code INTO v_mailbox_id, v_reference_code
    FROM public.mailboxes m WHERE m.customer_id = v_id ORDER BY m.created_at ASC, m.id ASC LIMIT 1;
  ELSIF TG_TABLE_NAME = 'articles' THEN
    v_reference_code := COALESCE(NEW.article_code, OLD.article_code);
  ELSIF TG_TABLE_NAME = 'payments' THEN
    v_mailbox_id := COALESCE(NEW.mailbox_id, OLD.mailbox_id); v_reference_code := COALESCE(NEW.payment_code, OLD.payment_code);
  ELSIF TG_TABLE_NAME = 'shipments' THEN
    v_mailbox_id := COALESCE(NEW.mailbox_id, OLD.mailbox_id); v_reference_code := COALESCE(NEW.shipment_code, OLD.shipment_code);
  ELSIF TG_TABLE_NAME = 'credits' THEN
    v_mailbox_id := COALESCE(NEW.mailbox_id, OLD.mailbox_id); v_reference_code := COALESCE(NEW.credit_code, OLD.credit_code);
  END IF;
  IF TG_OP = 'UPDATE' THEN v_before := to_jsonb(OLD); v_after := to_jsonb(NEW);
  ELSIF TG_OP = 'DELETE' THEN v_before := to_jsonb(OLD); v_after := NULL;
  ELSE v_before := NULL; v_after := to_jsonb(NEW); END IF;

  INSERT INTO public.movements(
    mailbox_id, movement_type, reference_id, reference_code, article_id,
    description, operator_user_id, movement_at, change_before, change_after
  ) VALUES (
    v_mailbox_id, v_type, v_id, v_reference_code,
    CASE WHEN TG_TABLE_NAME = 'articles' THEN v_id ELSE NULL END,
    v_description, auth.uid(), now(), v_before, v_after
  );
  RETURN COALESCE(NEW, OLD);
END;
$$;

NOTIFY pgrst, 'reload schema';
