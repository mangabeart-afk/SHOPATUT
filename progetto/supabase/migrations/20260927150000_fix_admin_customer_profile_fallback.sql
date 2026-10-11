create or replace function public.admin_create_mailbox_for_auth_user(
  p_user_id uuid,
  p_status text default 'ATTIVA',
  p_opened_at date default current_date,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $function$
declare
  v_customer_id uuid;
  v_mailbox_id uuid;
  v_mailbox_code text;
  v_email text;
  v_first_name text;
  v_last_name text;
  v_phone text;
  v_shipping_address text;
  v_shipping_postal_code text;
  v_shipping_city text;
  v_shipping_country text;
begin
  if not public.is_admin() then
    raise exception 'Operazione non autorizzata';
  end if;

  if p_status not in ('ATTIVA','SOSPESA','CHIUSA') then
    raise exception 'Stato casella non valido';
  end if;

  select
    u.email,
    nullif(btrim(coalesce(u.raw_user_meta_data ->> 'first_name','')),''),
    nullif(btrim(coalesce(u.raw_user_meta_data ->> 'last_name','')),''),
    nullif(btrim(coalesce(u.raw_user_meta_data ->> 'phone','')),''),
    nullif(btrim(coalesce(u.raw_user_meta_data ->> 'shipping_address','')),''),
    nullif(btrim(coalesce(u.raw_user_meta_data ->> 'shipping_postal_code','')),''),
    nullif(btrim(coalesce(u.raw_user_meta_data ->> 'shipping_city','')),''),
    nullif(btrim(coalesce(u.raw_user_meta_data ->> 'shipping_country','')),'')
  into v_email,v_first_name,v_last_name,v_phone,v_shipping_address,
       v_shipping_postal_code,v_shipping_city,v_shipping_country
  from auth.users u
  where u.id = p_user_id;

  if v_email is null then
    raise exception 'Utente Auth non trovato';
  end if;

  select customer_id into v_customer_id
  from public.profiles
  where user_id = p_user_id
  limit 1;

  if v_customer_id is null then
    if v_first_name is null or v_last_name is null then
      raise exception 'Profilo cliente non trovato per l''utente Auth e nome/cognome non disponibili';
    end if;

    insert into public.customers(
      first_name,last_name,email,phone,
      shipping_address,shipping_postal_code,shipping_city,shipping_country
    ) values (
      v_first_name,v_last_name,v_email,v_phone,
      v_shipping_address,v_shipping_postal_code,v_shipping_city,v_shipping_country
    ) returning id into v_customer_id;

    insert into public.profiles(
      user_id,role,customer_id,mailbox_id,display_name
    ) values (
      p_user_id,'CLIENTE',v_customer_id,null,
      concat(v_first_name,' ',v_last_name)
    );
  end if;

  select id,mailbox_code into v_mailbox_id,v_mailbox_code
  from public.mailboxes
  where customer_id = v_customer_id
  limit 1;

  if v_mailbox_id is not null then
    update public.profiles
    set mailbox_id = v_mailbox_id, updated_at = now()
    where user_id = p_user_id;
    return jsonb_build_object('customer_id',v_customer_id,'mailbox_id',v_mailbox_id,'mailbox_code',v_mailbox_code);
  end if;

  insert into public.mailboxes(customer_id,status,opened_at,notes)
  values(v_customer_id,p_status,coalesce(p_opened_at,current_date),nullif(btrim(p_notes),''))
  returning id,mailbox_code into v_mailbox_id,v_mailbox_code;

  update public.profiles
  set mailbox_id = v_mailbox_id, updated_at = now()
  where user_id = p_user_id;

  insert into public.movements(
    mailbox_id,movement_type,reference_id,reference_code,description,operator_user_id
  ) values (
    v_mailbox_id,'NUOVO_UTENTE',v_customer_id,v_mailbox_code,
    'Nuovo cliente e casella creati',auth.uid()
  );

  return jsonb_build_object('customer_id',v_customer_id,'mailbox_id',v_mailbox_id,'mailbox_code',v_mailbox_code);
end;
$function$;

grant execute on function public.admin_create_mailbox_for_auth_user(uuid,text,date,text) to authenticated, service_role;
