create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_customer_id uuid;
  v_first_name text;
  v_last_name text;
  v_phone text;
  v_shipping_address text;
  v_shipping_postal_code text;
  v_shipping_city text;
  v_shipping_country text;
begin
  if coalesce(new.raw_user_meta_data ->> 'admin_invite', '') = 'true' then
    return new;
  end if;

  v_first_name := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'first_name', '')), '');
  v_last_name := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'last_name', '')), '');
  v_phone := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'phone', '')), '');
  v_shipping_address := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'shipping_address', '')), '');
  v_shipping_postal_code := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'shipping_postal_code', '')), '');
  v_shipping_city := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'shipping_city', '')), '');
  v_shipping_country := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'shipping_country', '')), '');

  if v_first_name is null or v_last_name is null then
    raise exception 'Registrazione cliente incompleta: nome e cognome sono obbligatori';
  end if;

  insert into public.customers (
    first_name, last_name, email, phone,
    shipping_address, shipping_postal_code, shipping_city, shipping_country
  ) values (
    v_first_name, v_last_name, new.email, v_phone,
    v_shipping_address, v_shipping_postal_code, v_shipping_city, v_shipping_country
  )
  returning id into v_customer_id;

  insert into public.profiles (
    user_id, role, customer_id, mailbox_id, display_name
  ) values (
    new.id, 'CLIENTE', v_customer_id, null, concat(v_first_name, ' ', v_last_name)
  );

  return new;
end;
$function$;

grant execute on function public.handle_new_user() to authenticated, service_role;
