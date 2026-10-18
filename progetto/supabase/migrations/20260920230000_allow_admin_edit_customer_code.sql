-- Permette all'amministratore di modificare il codice cliente/casella generato automaticamente.
-- Il codice resta univoco e viene normalizzato in MAIUSCOLO.

CREATE OR REPLACE FUNCTION public.admin_update_mailbox_code(
  p_mailbox_id uuid,
  p_mailbox_code text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code text := upper(btrim(coalesce(p_mailbox_code, '')));
  v_existing_id uuid;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Operazione non autorizzata';
  END IF;

  IF p_mailbox_id IS NULL THEN
    RAISE EXCEPTION 'Casella non valida';
  END IF;

  IF v_code = '' THEN
    RAISE EXCEPTION 'Il codice cliente è obbligatorio';
  END IF;

  IF length(v_code) < 3 OR length(v_code) > 20 THEN
    RAISE EXCEPTION 'Il codice cliente deve contenere da 3 a 20 caratteri';
  END IF;

  IF v_code !~ '^[A-Z0-9]+$' THEN
    RAISE EXCEPTION 'Il codice cliente può contenere solo lettere e numeri, senza spazi';
  END IF;

  SELECT id
    INTO v_existing_id
    FROM public.mailboxes
   WHERE upper(mailbox_code) = v_code
     AND id <> p_mailbox_id
   LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    RAISE EXCEPTION 'Il codice cliente % è già utilizzato', v_code;
  END IF;

  UPDATE public.mailboxes
     SET mailbox_code = v_code
   WHERE id = p_mailbox_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Casella non trovata';
  END IF;

  RETURN v_code;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_update_mailbox_code(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_mailbox_code(uuid,text) TO authenticated;
