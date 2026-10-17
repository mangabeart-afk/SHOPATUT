-- SHOPATUT: quando un amministratore modifica l'email di un cliente,
-- l'applicazione crea un nuovo account Auth e invia una mail di reset password.
-- Il trigger di registrazione deve ignorare questi account tecnici per non creare
-- un secondo cliente/casella.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_customer_id uuid;
  v_customer_code text;
  v_mailbox_id uuid;
  v_first_name text;
  v_last_name text;
  v_phone text;
  v_shipping_address text;
  v_shipping_postal_code text;
  v_shipping_city text;
  v_shipping_country text;
BEGIN
  IF coalesce(NEW.raw_user_meta_data ->> 'admin_invite', '') = 'true' THEN
    RETURN NEW;
  END IF;

  v_first_name := nullif(btrim(coalesce(NEW.raw_user_meta_data ->> 'first_name', '')), '');
  v_last_name := nullif(btrim(coalesce(NEW.raw_user_meta_data ->> 'last_name', '')), '');
  v_phone := nullif(btrim(coalesce(NEW.raw_user_meta_data ->> 'phone', '')), '');
  v_shipping_address := nullif(btrim(coalesce(NEW.raw_user_meta_data ->> 'shipping_address', '')), '');
  v_shipping_postal_code := nullif(btrim(coalesce(NEW.raw_user_meta_data ->> 'shipping_postal_code', '')), '');
  v_shipping_city := nullif(btrim(coalesce(NEW.raw_user_meta_data ->> 'shipping_city', '')), '');
  v_shipping_country := nullif(btrim(coalesce(NEW.raw_user_meta_data ->> 'shipping_country', '')), '');

  IF v_first_name IS NULL OR v_last_name IS NULL THEN
    RAISE EXCEPTION 'Registrazione cliente incompleta: nome e cognome sono obbligatori';
  END IF;

  INSERT INTO public.customers(
    first_name, last_name, email, phone,
    shipping_address, shipping_postal_code, shipping_city, shipping_country
  ) VALUES (
    v_first_name, v_last_name, NEW.email, v_phone,
    v_shipping_address, v_shipping_postal_code, v_shipping_city, v_shipping_country
  ) RETURNING id, customer_code INTO v_customer_id, v_customer_code;

  INSERT INTO public.mailboxes(customer_id, status, opened_at, notes)
  VALUES (v_customer_id, 'ATTIVA', coalesce(NEW.created_at::date, current_date), NULL)
  RETURNING id INTO v_mailbox_id;

  INSERT INTO public.profiles(user_id, role, customer_id, mailbox_id, display_name)
  VALUES (NEW.id, 'CLIENTE', v_customer_id, v_mailbox_id, concat(v_first_name, ' ', v_last_name));

  RETURN NEW;
END;
$function$;
