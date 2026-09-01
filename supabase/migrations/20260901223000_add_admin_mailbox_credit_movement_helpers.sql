CREATE OR REPLACE FUNCTION public.admin_create_customer_mailbox(
  p_first_name text,
  p_last_name text,
  p_phone text DEFAULT NULL,
  p_email text DEFAULT NULL,
  p_status text DEFAULT 'ATTIVA',
  p_opened_at date DEFAULT CURRENT_DATE,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer_id uuid;
  v_mailbox_id uuid;
  v_mailbox_code text;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Operazione non autorizzata'; END IF;
  IF btrim(coalesce(p_first_name,'')) = '' OR btrim(coalesce(p_last_name,'')) = '' THEN RAISE EXCEPTION 'Nome e cognome sono obbligatori'; END IF;
  IF p_status NOT IN ('ATTIVA','SOSPESA','CHIUSA') THEN RAISE EXCEPTION 'Stato casella non valido'; END IF;
  INSERT INTO public.customers(first_name,last_name,phone,email)
  VALUES (btrim(p_first_name),btrim(p_last_name),nullif(btrim(p_phone),''),nullif(btrim(p_email),''))
  RETURNING id INTO v_customer_id;
  INSERT INTO public.mailboxes(customer_id,status,opened_at,notes)
  VALUES (v_customer_id,p_status,p_opened_at,nullif(btrim(p_notes),''))
  RETURNING id,mailbox_code INTO v_mailbox_id,v_mailbox_code;
  RETURN jsonb_build_object('customer_id',v_customer_id,'mailbox_id',v_mailbox_id,'mailbox_code',v_mailbox_code);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_create_customer_mailbox(text,text,text,text,text,date,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_create_customer_mailbox(text,text,text,text,text,date,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.credits_to_movements()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.movements(mailbox_id,movement_type,reference_id,reference_code,total_amount_eur,description,operator_user_id,notes)
    VALUES (NEW.mailbox_id,'CREDITO',NEW.id,NEW.credit_code,NEW.amount_eur,'Credito creato',auth.uid(),NEW.notes);
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.movements(mailbox_id,movement_type,reference_id,reference_code,total_amount_eur,description,operator_user_id,notes)
    VALUES (NEW.mailbox_id,'MODIFICA',NEW.id,NEW.credit_code,NEW.amount_eur,'Credito modificato',auth.uid(),NEW.notes);
    RETURN NEW;
  ELSE
    INSERT INTO public.movements(mailbox_id,movement_type,reference_id,reference_code,total_amount_eur,description,operator_user_id,notes)
    VALUES (OLD.mailbox_id,'ANNULLAMENTO',OLD.id,OLD.credit_code,OLD.amount_eur,'Credito cancellato',auth.uid(),OLD.notes);
    RETURN OLD;
  END IF;
END;
$$;
DROP TRIGGER IF EXISTS trg_credits_to_movements ON public.credits;
CREATE TRIGGER trg_credits_to_movements AFTER INSERT OR UPDATE OR DELETE ON public.credits FOR EACH ROW EXECUTE FUNCTION public.credits_to_movements();
INSERT INTO public.movements(mailbox_id,movement_type,reference_id,reference_code,total_amount_eur,description)
SELECT c.mailbox_id,'CREDITO',c.id,c.credit_code,c.amount_eur,'Credito creato'
FROM public.credits c
WHERE NOT EXISTS (SELECT 1 FROM public.movements m WHERE m.reference_id=c.id AND m.movement_type='CREDITO');
