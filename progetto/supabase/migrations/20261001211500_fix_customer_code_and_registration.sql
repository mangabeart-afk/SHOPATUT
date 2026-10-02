-- Codice cliente: generazione automatica, modifica manuale e sincronizzazione
-- con il codice della casella principale.

ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS customer_code text;

CREATE UNIQUE INDEX IF NOT EXISTS customers_customer_code_lower_unique
  ON public.customers (lower(customer_code))
  WHERE customer_code IS NOT NULL;

CREATE OR REPLACE FUNCTION public.make_customer_code(p_last_name text, p_customer_id uuid DEFAULT NULL)
RETURNS text LANGUAGE plpgsql SET search_path=public AS $function$
DECLARE
  clean text := upper(regexp_replace(coalesce(p_last_name,''), '[^[:alpha:]]', '', 'g'));
  consonants text[] := ARRAY[]::text[];
  vowels text[] := ARRAY[]::text[];
  c text; candidate text; i int; j int; k int;
BEGIN
  IF clean = '' THEN clean := 'XXX'; END IF;
  FOR i IN 1..length(clean) LOOP
    c := substr(clean,i,1);
    IF position(c in 'AEIOU') > 0 THEN vowels := array_append(vowels,c);
    ELSE consonants := array_append(consonants,c); END IF;
  END LOOP;
  IF coalesce(array_length(consonants,1),0) >= 3 THEN
    FOR i IN 1..array_length(consonants,1)-2 LOOP
      FOR j IN i+1..array_length(consonants,1)-1 LOOP
        FOR k IN j+1..array_length(consonants,1) LOOP
          candidate := to_char(current_date,'YYMM')||consonants[i]||consonants[j]||consonants[k];
          IF NOT EXISTS (SELECT 1 FROM public.customers WHERE lower(customer_code)=lower(candidate) AND id<>coalesce(p_customer_id,'00000000-0000-0000-0000-000000000000'::uuid)) THEN RETURN candidate; END IF;
        END LOOP;
      END LOOP;
    END LOOP;
  END IF;
  IF coalesce(array_length(consonants,1),0) >= 2 AND coalesce(array_length(vowels,1),0) >= 1 THEN
    FOR i IN 1..array_length(consonants,1)-1 LOOP
      FOR j IN i+1..array_length(consonants,1) LOOP
        FOR k IN 1..array_length(vowels,1) LOOP
          candidate := to_char(current_date,'YYMM')||consonants[i]||consonants[j]||vowels[k];
          IF NOT EXISTS (SELECT 1 FROM public.customers WHERE lower(customer_code)=lower(candidate) AND id<>coalesce(p_customer_id,'00000000-0000-0000-0000-000000000000'::uuid)) THEN RETURN candidate; END IF;
        END LOOP;
      END LOOP;
    END LOOP;
  END IF;
  IF coalesce(array_length(consonants,1),0) >= 1 AND coalesce(array_length(vowels,1),0) >= 2 THEN
    FOR i IN 1..array_length(consonants,1) LOOP
      FOR j IN 1..array_length(vowels,1)-1 LOOP
        FOR k IN j+1..array_length(vowels,1) LOOP
          candidate := to_char(current_date,'YYMM')||consonants[i]||vowels[j]||vowels[k];
          IF NOT EXISTS (SELECT 1 FROM public.customers WHERE lower(customer_code)=lower(candidate) AND id<>coalesce(p_customer_id,'00000000-0000-0000-0000-000000000000'::uuid)) THEN RETURN candidate; END IF;
        END LOOP;
      END LOOP;
    END LOOP;
  END IF;
  IF coalesce(array_length(vowels,1),0) >= 3 THEN
    FOR i IN 1..array_length(vowels,1)-2 LOOP
      FOR j IN i+1..array_length(vowels,1)-1 LOOP
        FOR k IN j+1..array_length(vowels,1) LOOP
          candidate := to_char(current_date,'YYMM')||vowels[i]||vowels[j]||vowels[k];
          IF NOT EXISTS (SELECT 1 FROM public.customers WHERE lower(customer_code)=lower(candidate) AND id<>coalesce(p_customer_id,'00000000-0000-0000-0000-000000000000'::uuid)) THEN RETURN candidate; END IF;
        END LOOP;
      END LOOP;
    END LOOP;
  END IF;
  FOR i IN 0..999 LOOP
    candidate := to_char(current_date,'YYMM')||'XXX'||lpad(i::text,2,'0');
    IF NOT EXISTS (SELECT 1 FROM public.customers WHERE lower(customer_code)=lower(candidate) AND id<>coalesce(p_customer_id,'00000000-0000-0000-0000-000000000000'::uuid)) THEN RETURN candidate; END IF;
  END LOOP;
  RAISE EXCEPTION 'Impossibile generare un codice cliente univoco';
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_customer_code()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $function$
BEGIN
  IF NEW.customer_code IS NULL OR btrim(NEW.customer_code) = '' THEN
    NEW.customer_code := public.make_customer_code(NEW.last_name, NEW.id);
  END IF;
  RETURN NEW;
END;
$function$;

UPDATE public.customers c
SET customer_code = COALESCE(
  NULLIF((SELECT btrim(m.mailbox_code) FROM public.mailboxes m WHERE m.customer_id=c.id ORDER BY m.created_at,m.id LIMIT 1),''),
  public.make_customer_code(c.last_name,c.id)
)
WHERE c.customer_code IS NULL OR btrim(c.customer_code)='';

UPDATE public.mailboxes m
SET mailbox_code=c.customer_code
FROM public.customers c
WHERE c.id=m.customer_id AND c.customer_code IS NOT NULL AND btrim(c.customer_code)<>'';

CREATE OR REPLACE FUNCTION public.admin_update_customer_code(p_customer_id uuid,p_customer_code text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $function$
DECLARE v_code text := upper(btrim(coalesce(p_customer_code,''))); v_mailbox_id uuid;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Operazione non autorizzata'; END IF;
  IF p_customer_id IS NULL THEN RAISE EXCEPTION 'Cliente non valido'; END IF;
  IF v_code='' THEN RAISE EXCEPTION 'Il codice cliente è obbligatorio'; END IF;
  IF length(v_code)<3 OR length(v_code)>20 THEN RAISE EXCEPTION 'Il codice cliente deve contenere da 3 a 20 caratteri'; END IF;
  IF v_code !~ '^[A-Z0-9]+$' THEN RAISE EXCEPTION 'Il codice cliente può contenere solo lettere e numeri, senza spazi'; END IF;
  IF EXISTS (SELECT 1 FROM public.customers WHERE lower(customer_code)=lower(v_code) AND id<>p_customer_id) THEN RAISE EXCEPTION 'Il codice cliente % è già utilizzato',v_code; END IF;
  UPDATE public.customers SET customer_code=v_code,updated_at=now() WHERE id=p_customer_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cliente non trovato'; END IF;
  SELECT id INTO v_mailbox_id FROM public.mailboxes WHERE customer_id=p_customer_id ORDER BY created_at,id LIMIT 1;
  IF v_mailbox_id IS NOT NULL THEN UPDATE public.mailboxes SET mailbox_code=v_code,updated_at=now() WHERE id=v_mailbox_id; END IF;
  RETURN v_code;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_update_customer_code(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_update_customer_code(uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $function$
DECLARE v_customer_id uuid; v_mailbox_id uuid; v_customer_code text; v_first_name text; v_last_name text; v_phone text; v_shipping_address text; v_shipping_postal_code text; v_shipping_city text; v_shipping_country text;
BEGIN
  IF coalesce(new.raw_user_meta_data->>'admin_invite','')='true' THEN RETURN new; END IF;
  v_first_name:=nullif(btrim(coalesce(new.raw_user_meta_data->>'first_name','')),'');
  v_last_name:=nullif(btrim(coalesce(new.raw_user_meta_data->>'last_name','')),'');
  v_phone:=nullif(btrim(coalesce(new.raw_user_meta_data->>'phone','')),'');
  v_shipping_address:=nullif(btrim(coalesce(new.raw_user_meta_data->>'shipping_address','')),'');
  v_shipping_postal_code:=nullif(btrim(coalesce(new.raw_user_meta_data->>'shipping_postal_code','')),'');
  v_shipping_city:=nullif(btrim(coalesce(new.raw_user_meta_data->>'shipping_city','')),'');
  v_shipping_country:=nullif(btrim(coalesce(new.raw_user_meta_data->>'shipping_country','')),'');
  IF v_first_name IS NULL OR v_last_name IS NULL THEN RAISE EXCEPTION 'Registrazione cliente incompleta: nome e cognome sono obbligatori'; END IF;
  INSERT INTO public.customers(first_name,last_name,email,phone,shipping_address,shipping_postal_code,shipping_city,shipping_country)
  VALUES(v_first_name,v_last_name,new.email,v_phone,v_shipping_address,v_shipping_postal_code,v_shipping_city,v_shipping_country)
  RETURNING id,customer_code INTO v_customer_id,v_customer_code;
  INSERT INTO public.mailboxes(customer_id,mailbox_code,status,opened_at,notes)
  VALUES(v_customer_id,v_customer_code,'ATTIVA',current_date,null) RETURNING id INTO v_mailbox_id;
  INSERT INTO public.profiles(user_id,role,customer_id,mailbox_id,display_name) VALUES(new.id,'CLIENTE',v_customer_id,v_mailbox_id,concat(v_first_name,' ',v_last_name));
  INSERT INTO public.movements(mailbox_id,movement_type,reference_id,reference_code,description,operator_user_id) VALUES(v_mailbox_id,'NUOVO_UTENTE',v_customer_id,v_customer_code,'Nuovo cliente, casella e codice cliente creati',null);
  RETURN new;
END;
$function$;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;

CREATE OR REPLACE FUNCTION public.admin_create_mailbox_for_auth_user(p_user_id uuid,p_status text DEFAULT 'ATTIVA',p_opened_at date DEFAULT current_date,p_notes text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth AS $function$
DECLARE v_customer_id uuid; v_mailbox_id uuid; v_mailbox_code text; v_customer_code text; v_email text; v_first_name text; v_last_name text; v_phone text; v_shipping_address text; v_shipping_postal_code text; v_shipping_city text; v_shipping_country text;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Operazione non autorizzata'; END IF;
  IF p_status NOT IN ('ATTIVA','SOSPESA','CHIUSA') THEN RAISE EXCEPTION 'Stato casella non valido'; END IF;
  SELECT u.email,nullif(btrim(coalesce(u.raw_user_meta_data->>'first_name','')),''),nullif(btrim(coalesce(u.raw_user_meta_data->>'last_name','')),''),nullif(btrim(coalesce(u.raw_user_meta_data->>'phone','')),''),nullif(btrim(coalesce(u.raw_user_meta_data->>'shipping_address','')),''),nullif(btrim(coalesce(u.raw_user_meta_data->>'shipping_postal_code','')),''),nullif(btrim(coalesce(u.raw_user_meta_data->>'shipping_city','')),''),nullif(btrim(coalesce(u.raw_user_meta_data->>'shipping_country','')),'') INTO v_email,v_first_name,v_last_name,v_phone,v_shipping_address,v_shipping_postal_code,v_shipping_city,v_shipping_country FROM auth.users u WHERE u.id=p_user_id;
  IF v_email IS NULL THEN RAISE EXCEPTION 'Utente Auth non trovato'; END IF;
  SELECT customer_id INTO v_customer_id FROM public.profiles WHERE user_id=p_user_id LIMIT 1;
  IF v_customer_id IS NULL THEN
    IF v_first_name IS NULL OR v_last_name IS NULL THEN RAISE EXCEPTION 'Profilo cliente non trovato per l''utente Auth e nome/cognome non disponibili'; END IF;
    INSERT INTO public.customers(first_name,last_name,email,phone,shipping_address,shipping_postal_code,shipping_city,shipping_country) VALUES(v_first_name,v_last_name,v_email,v_phone,v_shipping_address,v_shipping_postal_code,v_shipping_city,v_shipping_country) RETURNING id,customer_code INTO v_customer_id,v_customer_code;
    INSERT INTO public.profiles(user_id,role,customer_id,mailbox_id,display_name) VALUES(p_user_id,'CLIENTE',v_customer_id,null,concat(v_first_name,' ',v_last_name));
  ELSE SELECT customer_code INTO v_customer_code FROM public.customers WHERE id=v_customer_id; END IF;
  SELECT id,mailbox_code INTO v_mailbox_id,v_mailbox_code FROM public.mailboxes WHERE customer_id=v_customer_id ORDER BY created_at,id LIMIT 1;
  IF v_mailbox_id IS NULL THEN
    INSERT INTO public.mailboxes(customer_id,mailbox_code,status,opened_at,notes) VALUES(v_customer_id,v_customer_code,p_status,coalesce(p_opened_at,current_date),nullif(btrim(p_notes),'')) RETURNING id,mailbox_code INTO v_mailbox_id,v_mailbox_code;
  END IF;
  UPDATE public.profiles SET mailbox_id=v_mailbox_id,updated_at=now() WHERE user_id=p_user_id;
  IF NOT EXISTS(SELECT 1 FROM public.movements WHERE mailbox_id=v_mailbox_id AND movement_type='NUOVO_UTENTE') THEN INSERT INTO public.movements(mailbox_id,movement_type,reference_id,reference_code,description,operator_user_id) VALUES(v_mailbox_id,'NUOVO_UTENTE',v_customer_id,v_mailbox_code,'Nuovo cliente e casella creati',auth.uid()); END IF;
  RETURN jsonb_build_object('customer_id',v_customer_id,'mailbox_id',v_mailbox_id,'mailbox_code',v_mailbox_code,'customer_code',v_customer_code);
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_create_mailbox_for_auth_user(uuid,text,date,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_create_mailbox_for_auth_user(uuid,text,date,text) TO authenticated,service_role;

DROP FUNCTION IF EXISTS public.admin_ensure_customer_mailbox(uuid,text,date,text);

NOTIFY pgrst,'reload schema';
