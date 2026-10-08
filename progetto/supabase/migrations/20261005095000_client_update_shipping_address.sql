CREATE OR REPLACE FUNCTION public.update_my_shipping_address(
  p_shipping_address text,
  p_shipping_postal_code text,
  p_shipping_city text,
  p_shipping_country text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_customer_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Autenticazione richiesta';
  END IF;

  SELECT p.customer_id
  INTO v_customer_id
  FROM public.profiles AS p
  WHERE p.user_id = auth.uid()
    AND p.role = 'CLIENTE'
  LIMIT 1;

  IF v_customer_id IS NULL THEN
    RAISE EXCEPTION 'Profilo cliente non trovato';
  END IF;

  IF length(coalesce(p_shipping_address, '')) > 250
     OR length(coalesce(p_shipping_postal_code, '')) > 20
     OR length(coalesce(p_shipping_city, '')) > 100
     OR length(coalesce(p_shipping_country, '')) > 100 THEN
    RAISE EXCEPTION 'Uno o più campi superano la lunghezza consentita';
  END IF;

  UPDATE public.customers
  SET
    shipping_address = nullif(btrim(coalesce(p_shipping_address, '')), ''),
    shipping_postal_code = nullif(btrim(coalesce(p_shipping_postal_code, '')), ''),
    shipping_city = nullif(btrim(coalesce(p_shipping_city, '')), ''),
    shipping_country = nullif(btrim(coalesce(p_shipping_country, '')), ''),
    updated_at = now()
  WHERE id = v_customer_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cliente non trovato';
  END IF;

  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public.update_my_shipping_address(text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_my_shipping_address(text, text, text, text) TO authenticated;
