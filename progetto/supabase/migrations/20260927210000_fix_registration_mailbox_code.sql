-- Fix registrazione cliente: ogni nuovo utente deve avere automaticamente
-- cliente + profilo + casella con codice cliente.
-- Ripara inoltre i clienti già esistenti privi di casella/codice.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_customer_id uuid;
  v_mailbox_id uuid;
  v_mailbox_code text;
  v_profile_mailbox_id uuid;
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

  -- La casella viene creata nello stesso trigger della registrazione.
  -- mailbox_code viene generato automaticamente dalla configurazione della tabella.
  insert into public.mailboxes (customer_id, status, opened_at, notes)
  values (v_customer_id, 'ATTIVA', current_date, null)
  returning id, mailbox_code into v_mailbox_id, v_mailbox_code;

  if v_mailbox_id is null or nullif(btrim(coalesce(v_mailbox_code, '')), '') is null then
    raise exception 'Registrazione cliente incompleta: impossibile generare il codice cliente';
  end if;

  insert into public.profiles (
    user_id, role, customer_id, mailbox_id, display_name
  ) values (
    new.id, 'CLIENTE', v_customer_id, v_mailbox_id, concat(v_first_name, ' ', v_last_name)
  );

  insert into public.movements (
    mailbox_id, movement_type, reference_id, reference_code,
    description, operator_user_id
  ) values (
    v_mailbox_id, 'NUOVO_UTENTE', v_customer_id, v_mailbox_code,
    'Nuovo cliente, casella e codice cliente creati', null
  );

  return new;
end;
$function$;

grant execute on function public.handle_new_user() to authenticated, service_role;

-- RPC amministrativa per riparare un cliente già presente senza casella/codice.
create or replace function public.admin_ensure_customer_mailbox(
  p_customer_id uuid,
  p_status text default 'ATTIVA',
  p_opened_at date default current_date,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_customer public.customers%rowtype;
  v_profile_user_id uuid;
  v_mailbox_id uuid;
  v_mailbox_code text;
begin
  if not public.is_admin() then
    raise exception 'Operazione non autorizzata';
  end if;

  if p_customer_id is null then
    raise exception 'Cliente non valido';
  end if;

  if p_status not in ('ATTIVA', 'SOSPESA', 'CHIUSA') then
    raise exception 'Stato casella non valido';
  end if;

  select * into v_customer
  from public.customers
  where id = p_customer_id;

  if v_customer.id is null then
    raise exception 'Cliente non trovato';
  end if;

  select id, mailbox_code into v_mailbox_id, v_mailbox_code
  from public.mailboxes
  where customer_id = p_customer_id
  order by created_at asc, id asc
  limit 1;

  if v_mailbox_id is null then
    insert into public.mailboxes(customer_id, status, opened_at, notes)
    values (
      p_customer_id,
      p_status,
      coalesce(p_opened_at, current_date),
      nullif(btrim(p_notes), '')
    )
    returning id, mailbox_code into v_mailbox_id, v_mailbox_code;
  end if;

  if v_mailbox_id is null or nullif(btrim(coalesce(v_mailbox_code, '')), '') is null then
    raise exception 'Impossibile generare il codice cliente';
  end if;

  select user_id into v_profile_user_id
  from public.profiles
  where customer_id = p_customer_id
  order by created_at asc nulls last
  limit 1;

  if v_profile_user_id is not null then
    update public.profiles
    set mailbox_id = v_mailbox_id,
        updated_at = now()
    where user_id = v_profile_user_id;
  end if;

  if not exists (
    select 1 from public.movements
    where mailbox_id = v_mailbox_id
      and movement_type = 'NUOVO_UTENTE'
  ) then
    insert into public.movements(
      mailbox_id, movement_type, reference_id, reference_code,
      description, operator_user_id
    ) values (
      v_mailbox_id, 'NUOVO_UTENTE', p_customer_id, v_mailbox_code,
      'Casella e codice cliente ripristinati', auth.uid()
    );
  end if;

  return jsonb_build_object(
    'customer_id', p_customer_id,
    'mailbox_id', v_mailbox_id,
    'mailbox_code', v_mailbox_code
  );
end;
$function$;

revoke all on function public.admin_ensure_customer_mailbox(uuid,text,date,text) from public, anon;
grant execute on function public.admin_ensure_customer_mailbox(uuid,text,date,text) to authenticated;

-- Assicura che una nuova registrazione esegua sempre il trigger anche in installazioni
-- dove il trigger non è stato ricreato insieme alle migrazioni.
do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'on_auth_user_created'
      and tgrelid = 'auth.users'::regclass
      and not tgisinternal
  ) then
    create trigger on_auth_user_created
      after insert on auth.users
      for each row execute function public.handle_new_user();
  end if;
end;
$$;
