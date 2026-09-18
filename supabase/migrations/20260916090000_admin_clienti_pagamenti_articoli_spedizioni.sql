-- MangaBEART [ShopaTüT] - admin workflow update
-- Clienti + Caselle unificati nell'interfaccia, foto articoli, pagamenti FIFO, spedizioni IN_STOCK.

ALTER TABLE public.articles
  ADD COLUMN IF NOT EXISTS commission_cost numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS commission_currency text NOT NULL DEFAULT 'EUR',
  ADD COLUMN IF NOT EXISTS commission_exchange_rate numeric NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS customs_cost numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS customs_currency text NOT NULL DEFAULT 'EUR',
  ADD COLUMN IF NOT EXISTS customs_exchange_rate numeric NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS shipping_cost numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS shipping_currency text NOT NULL DEFAULT 'EUR',
  ADD COLUMN IF NOT EXISTS seller_page_url text,
  ADD COLUMN IF NOT EXISTS photo_url text;

CREATE TABLE IF NOT EXISTS public.payment_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES public.payments(id) ON DELETE CASCADE,
  movement_id uuid NOT NULL REFERENCES public.movements(id) ON DELETE CASCADE,
  amount_eur numeric NOT NULL CHECK (amount_eur > 0),
  allocated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(payment_id, movement_id)
);
CREATE INDEX IF NOT EXISTS payment_allocations_payment_id_idx ON public.payment_allocations(payment_id);
CREATE INDEX IF NOT EXISTS payment_allocations_movement_id_idx ON public.payment_allocations(movement_id);
ALTER TABLE public.payment_allocations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS payment_allocations_admin_all ON public.payment_allocations;
CREATE POLICY payment_allocations_admin_all ON public.payment_allocations FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

INSERT INTO storage.buckets(id,name,public) VALUES ('article-photos','article-photos',true) ON CONFLICT(id) DO NOTHING;
DROP POLICY IF EXISTS article_photos_admin_insert ON storage.objects;
CREATE POLICY article_photos_admin_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id='article-photos' AND public.is_admin());
DROP POLICY IF EXISTS article_photos_admin_update ON storage.objects;
CREATE POLICY article_photos_admin_update ON storage.objects FOR UPDATE TO authenticated USING (bucket_id='article-photos' AND public.is_admin()) WITH CHECK (bucket_id='article-photos' AND public.is_admin());
DROP POLICY IF EXISTS article_photos_admin_delete ON storage.objects;
CREATE POLICY article_photos_admin_delete ON storage.objects FOR DELETE TO authenticated USING (bucket_id='article-photos' AND public.is_admin());

CREATE OR REPLACE FUNCTION public.admin_create_customer_mailbox(
  p_first_name text, p_last_name text, p_phone text DEFAULT NULL, p_email text DEFAULT NULL,
  p_status text DEFAULT 'ATTIVA', p_opened_at date DEFAULT CURRENT_DATE, p_notes text DEFAULT NULL,
  p_shipping_address text DEFAULT NULL, p_shipping_city text DEFAULT NULL,
  p_shipping_postal_code text DEFAULT NULL, p_shipping_country text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_customer_id uuid; v_mailbox_id uuid; v_mailbox_code text;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Operazione non autorizzata'; END IF;
  IF btrim(coalesce(p_first_name,''))='' OR btrim(coalesce(p_last_name,''))='' THEN RAISE EXCEPTION 'Nome e cognome sono obbligatori'; END IF;
  IF p_status NOT IN ('ATTIVA','SOSPESA','CHIUSA') THEN RAISE EXCEPTION 'Stato casella non valido'; END IF;
  INSERT INTO public.customers(first_name,last_name,phone,email,shipping_address,shipping_city,shipping_postal_code,shipping_country)
  VALUES(btrim(p_first_name),btrim(p_last_name),nullif(btrim(p_phone),''),nullif(btrim(p_email),''),nullif(btrim(p_shipping_address),''),nullif(btrim(p_shipping_city),''),nullif(btrim(p_shipping_postal_code),''),nullif(btrim(p_shipping_country),''))
  RETURNING id INTO v_customer_id;
  INSERT INTO public.mailboxes(customer_id,status,opened_at,notes) VALUES(v_customer_id,p_status,p_opened_at,nullif(btrim(p_notes),'')) RETURNING id,mailbox_code INTO v_mailbox_id,v_mailbox_code;
  RETURN jsonb_build_object('customer_id',v_customer_id,'mailbox_id',v_mailbox_id,'mailbox_code',v_mailbox_code);
END; $$;
GRANT EXECUTE ON FUNCTION public.admin_create_customer_mailbox(text,text,text,text,text,date,text,text,text,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.recalculate_article_costs() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE purchase_eur numeric; commission_eur numeric; customs_eur numeric; shipping_eur numeric;
BEGIN
  purchase_eur := coalesce(new.unit_price_foreign,0)*coalesce(new.quantity_purchased,0)/case when upper(coalesce(new.currency,'EUR'))='EUR' then 1 else greatest(coalesce(new.exchange_rate,1),0.00000001) end;
  commission_eur := case when upper(coalesce(new.commission_mode,'FIXED'))='PERCENT' then purchase_eur*greatest(coalesce(new.commission_percent,0),0)/100 else coalesce(new.commission_cost,0)/case when upper(coalesce(new.commission_currency,'EUR'))='EUR' then 1 else greatest(coalesce(new.commission_exchange_rate,1),0.00000001) end end;
  customs_eur := case when upper(coalesce(new.customs_mode,'FIXED'))='PERCENT' then purchase_eur*greatest(coalesce(new.customs_percent,0),0)/100 else coalesce(new.customs_cost,0)/case when upper(coalesce(new.customs_currency,'EUR'))='EUR' then 1 else greatest(coalesce(new.customs_exchange_rate,1),0.00000001) end end;
  shipping_eur := case when upper(coalesce(new.shipping_mode,'FIXED'))='PERCENT' then purchase_eur*greatest(coalesce(new.shipping_percent,0),0)/100 else coalesce(new.shipping_cost,0)/case when upper(coalesce(new.shipping_currency,'EUR'))='EUR' then 1 else greatest(coalesce(new.shipping_exchange_rate,1),0.00000001) end end;
  new.accessory_cost_eur:=commission_eur+customs_eur+shipping_eur; new.total_cost_eur:=purchase_eur+new.accessory_cost_eur;
  new.unit_cost_eur:=case when coalesce(new.quantity_purchased,0)>0 then new.total_cost_eur/new.quantity_purchased else 0 end; new.updated_at:=now(); return new;
END; $$;

CREATE OR REPLACE FUNCTION public.register_customer_payment(p_mailbox_id uuid,p_amount numeric,p_currency text,p_exchange_rate numeric,p_payment_date date,p_payment_method text,p_notes text DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_payment_id uuid; v_payment_code text; v_amount_eur numeric; v_remaining numeric; v_movement record; v_alloc numeric; v_available numeric;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Operazione non autorizzata'; END IF;
  IF p_mailbox_id IS NULL THEN RAISE EXCEPTION 'Casella obbligatoria'; END IF;
  IF p_amount IS NULL OR p_amount<=0 THEN RAISE EXCEPTION 'Importo non valido'; END IF;
  IF p_exchange_rate IS NULL OR p_exchange_rate<=0 THEN RAISE EXCEPTION 'Cambio valuta non valido'; END IF;
  v_amount_eur:=case when upper(coalesce(p_currency,'EUR'))='EUR' then p_amount else p_amount/p_exchange_rate end;
  v_payment_code:=public.next_entity_code('P');
  INSERT INTO public.payments(payment_code,mailbox_id,payment_date,amount,currency,exchange_rate,amount_eur,payment_method,status,notes,created_by)
  VALUES(v_payment_code,p_mailbox_id,coalesce(p_payment_date,current_date),p_amount,upper(coalesce(p_currency,'EUR')),p_exchange_rate,v_amount_eur,p_payment_method,'REGISTRATO',p_notes,auth.uid()) RETURNING id INTO v_payment_id;
  INSERT INTO public.movements(mailbox_id,movement_type,reference_id,reference_code,total_amount_eur,description,operator_user_id,notes)
  VALUES(p_mailbox_id,'PAGAMENTO',v_payment_id,v_payment_code,v_amount_eur,'Pagamento registrato',auth.uid(),p_notes);
  v_remaining:=v_amount_eur;
  FOR v_movement IN SELECT m.id,m.total_amount_eur,coalesce((select sum(pa.amount_eur) from public.payment_allocations pa where pa.movement_id=m.id),0) paid FROM public.movements m WHERE m.mailbox_id=p_mailbox_id AND m.movement_type='VENDITA' AND coalesce(m.total_amount_eur,0)>0 ORDER BY m.movement_at ASC,m.id ASC FOR UPDATE LOOP
    v_available:=greatest(0,coalesce(v_movement.total_amount_eur,0)-coalesce(v_movement.paid,0));
    IF v_available<=0 THEN CONTINUE; END IF;
    v_alloc:=least(v_remaining,v_available);
    IF v_alloc>0 THEN INSERT INTO public.payment_allocations(payment_id,movement_id,amount_eur) VALUES(v_payment_id,v_movement.id,v_alloc); v_remaining:=v_remaining-v_alloc; END IF;
    IF v_remaining<=0 THEN EXIT; END IF;
  END LOOP;
  RETURN v_payment_id;
END; $$;
GRANT EXECUTE ON FUNCTION public.register_customer_payment(uuid,numeric,text,numeric,date,text,text) TO authenticated;

NOTIFY pgrst, 'reload schema';

drop policy if exists payment_allocations_customer_select on public.payment_allocations;
create policy payment_allocations_customer_select on public.payment_allocations
for select to authenticated
using (
  exists (select 1 from public.payments p where p.id=payment_allocations.payment_id and p.mailbox_id=public.my_mailbox_id())
  or exists (select 1 from public.movements m where m.id=payment_allocations.movement_id and m.mailbox_id=public.my_mailbox_id())
);
