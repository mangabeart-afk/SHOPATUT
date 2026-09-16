ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS customer_code text;
ALTER TABLE public.articles ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'IN_STOCK';
ALTER TABLE public.articles ADD COLUMN IF NOT EXISTS photo_url text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'articles_status_check') THEN
    ALTER TABLE public.articles ADD CONSTRAINT articles_status_check CHECK (status IN ('IN_ARRIVO','IN_STOCK','VENDUTO'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS customers_customer_code_unique ON public.customers(customer_code) WHERE customer_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_articles_status_created_at ON public.articles(status, created_at DESC);

CREATE OR REPLACE FUNCTION public.make_customer_code(p_last_name text, p_customer_id uuid DEFAULT gen_random_uuid())
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  clean text := upper(regexp_replace(coalesce(p_last_name,''), '[^[:alpha:]]', '', 'g'));
  consonants text[] := ARRAY[]::text[];
  vowels text[] := ARRAY[]::text[];
  c text; candidate text; i int; j int; k int;
BEGIN
  IF clean='' THEN clean:='XXX'; END IF;
  FOR i IN 1..length(clean) LOOP
    c:=substr(clean,i,1);
    IF position(c in 'AEIOU') > 0 THEN vowels:=array_append(vowels,c);
    ELSE consonants:=array_append(consonants,c); END IF;
  END LOOP;
  IF coalesce(array_length(consonants,1),0)>=3 THEN
    FOR i IN 1..array_length(consonants,1)-2 LOOP
      FOR j IN i+1..array_length(consonants,1)-1 LOOP
        FOR k IN j+1..array_length(consonants,1) LOOP
          candidate:=to_char(current_date,'YYMM')||consonants[i]||consonants[j]||consonants[k];
          IF NOT EXISTS (SELECT 1 FROM public.customers WHERE customer_code=candidate AND id<>coalesce(p_customer_id,'00000000-0000-0000-0000-000000000000'::uuid)) THEN RETURN candidate; END IF;
        END LOOP;
      END LOOP;
    END LOOP;
  END IF;
  IF coalesce(array_length(consonants,1),0)>=2 AND coalesce(array_length(vowels,1),0)>=1 THEN
    FOR i IN 1..array_length(consonants,1)-1 LOOP
      FOR j IN i+1..array_length(consonants,1) LOOP
        FOR k IN 1..array_length(vowels,1) LOOP
          candidate:=to_char(current_date,'YYMM')||consonants[i]||consonants[j]||vowels[k];
          IF NOT EXISTS (SELECT 1 FROM public.customers WHERE customer_code=candidate AND id<>coalesce(p_customer_id,'00000000-0000-0000-0000-000000000000'::uuid)) THEN RETURN candidate; END IF;
        END LOOP;
      END LOOP;
    END LOOP;
  END IF;
  IF coalesce(array_length(consonants,1),0)>=1 AND coalesce(array_length(vowels,1),0)>=2 THEN
    FOR i IN 1..array_length(consonants,1) LOOP
      FOR j IN 1..array_length(vowels,1)-1 LOOP
        FOR k IN j+1..array_length(vowels,1) LOOP
          candidate:=to_char(current_date,'YYMM')||consonants[i]||vowels[j]||vowels[k];
          IF NOT EXISTS (SELECT 1 FROM public.customers WHERE customer_code=candidate AND id<>coalesce(p_customer_id,'00000000-0000-0000-0000-000000000000'::uuid)) THEN RETURN candidate; END IF;
        END LOOP;
      END LOOP;
    END LOOP;
  END IF;
  candidate:=to_char(current_date,'YYMM')||'XXX';
  IF NOT EXISTS (SELECT 1 FROM public.customers WHERE customer_code=candidate AND id<>coalesce(p_customer_id,'00000000-0000-0000-0000-000000000000'::uuid)) THEN RETURN candidate; END IF;
  RAISE EXCEPTION 'Impossibile generare un codice cliente univoco';
END; $$;

CREATE OR REPLACE FUNCTION public.set_customer_code() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.customer_code IS NULL OR btrim(NEW.customer_code)='' THEN NEW.customer_code:=public.make_customer_code(NEW.last_name,NEW.id); END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_set_customer_code ON public.customers;
CREATE TRIGGER trg_set_customer_code BEFORE INSERT OR UPDATE OF last_name ON public.customers FOR EACH ROW EXECUTE FUNCTION public.set_customer_code();

CREATE OR REPLACE FUNCTION public.register_article_arrival(p_article_ids uuid[]) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE aid uuid; purchased int; sold int;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Operazione non autorizzata'; END IF;
  FOREACH aid IN ARRAY p_article_ids LOOP
    SELECT quantity_purchased INTO purchased FROM public.articles WHERE id=aid FOR UPDATE;
    IF purchased IS NULL THEN RAISE EXCEPTION 'Articolo non trovato: %', aid; END IF;
    SELECT coalesce(sum(quantity),0) INTO sold FROM public.movements WHERE movement_type='VENDITA' AND article_id=aid;
    UPDATE public.articles SET status=CASE WHEN sold>=purchased THEN 'VENDUTO' ELSE 'IN_STOCK' END,updated_at=now() WHERE id=aid;
  END LOOP;
END; $$;

CREATE OR REPLACE FUNCTION public.register_article_sales(p_customer_code text,p_lines jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE customer_id uuid; mailbox_id uuid; line jsonb; aid uuid; qty int; price numeric; purchased int; sold int; status_now text; total numeric;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Operazione non autorizzata'; END IF;
  SELECT id INTO customer_id FROM public.customers WHERE upper(customer_code)=upper(btrim(p_customer_code));
  IF customer_id IS NULL THEN RAISE EXCEPTION 'Codice cliente non trovato: %',p_customer_code; END IF;
  SELECT id INTO mailbox_id FROM public.mailboxes WHERE customer_id=customer_id;
  IF mailbox_id IS NULL THEN RAISE EXCEPTION 'Nessuna casella associata al cliente %',p_customer_code; END IF;
  FOR line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    aid:=(line->>'article_id')::uuid; qty:=(line->>'quantity')::int; price:=(line->>'price')::numeric;
    IF qty IS NULL OR qty<=0 OR price IS NULL OR price<0 THEN RAISE EXCEPTION 'Quantità o prezzo non validi'; END IF;
    SELECT quantity_purchased,status INTO purchased,status_now FROM public.articles WHERE id=aid FOR UPDATE;
    IF purchased IS NULL THEN RAISE EXCEPTION 'Articolo non trovato: %',aid; END IF;
    SELECT coalesce(sum(quantity),0) INTO sold FROM public.movements WHERE movement_type='VENDITA' AND article_id=aid;
    IF sold+qty>purchased THEN RAISE EXCEPTION 'Quantità venduta superiore alla disponibilità per %',aid; END IF;
    INSERT INTO public.article_assignments(article_id,mailbox_id,quantity_assigned,status,notes) VALUES(aid,mailbox_id,qty,'ATTIVA','Vendita registrata dal pannello Articoli');
    total:=qty*price;
    INSERT INTO public.movements(mailbox_id,movement_type,article_id,quantity,unit_price_eur,total_amount_eur,generic_customer_name,description,operator_user_id) VALUES(mailbox_id,'VENDITA',aid,qty,price,total,p_customer_code,'Vendita articolo',auth.uid());
    IF status_now='IN_STOCK' AND sold+qty>=purchased THEN UPDATE public.articles SET status='VENDUTO',updated_at=now() WHERE id=aid; END IF;
  END LOOP;
END; $$;
GRANT EXECUTE ON FUNCTION public.register_article_arrival(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.register_article_sales(text,jsonb) TO authenticated;

DROP POLICY IF EXISTS customer_incoming_articles ON public.articles;
CREATE POLICY customer_incoming_articles ON public.articles FOR SELECT TO authenticated USING (status='IN_ARRIVO');
