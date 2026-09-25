-- Restore live workflow RPCs and centralize sale cancellation/article archive deletion.
begin;

alter table public.articles
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_reason text;

create table if not exists public.payment_allocations (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments(id) on delete cascade,
  movement_id uuid not null references public.movements(id) on delete cascade,
  amount_eur numeric not null check (amount_eur > 0),
  allocated_at timestamptz not null default now(),
  unique(payment_id,movement_id)
);
create index if not exists payment_allocations_payment_id_idx on public.payment_allocations(payment_id);
create index if not exists payment_allocations_movement_id_idx on public.payment_allocations(movement_id);
alter table public.payment_allocations enable row level security;
drop policy if exists payment_allocations_admin_all on public.payment_allocations;
create policy payment_allocations_admin_all on public.payment_allocations for all to authenticated using (public.is_admin()) with check (public.is_admin());

alter table public.movements drop constraint if exists movements_movement_type_check;
alter table public.movements add constraint movements_movement_type_check check (movement_type = any(array['NUOVO_UTENTE','ARTICOLO','VENDITA','PAGAMENTO','CREDITO','SPEDIZIONE','MODIFICA','ANNULLAMENTO','STORNO','ALTRO']));

-- Sale registration: assignment is created before the VENDITA movement because the
-- existing sale-validation trigger requires an active assignment.
drop function if exists public.register_article_sales(text,jsonb);
drop function if exists public.register_article_sales(text,jsonb,date);
create or replace function public.register_article_sales(p_customer_code text,p_lines jsonb,p_movement_date date default current_date)
returns void language plpgsql security definer set search_path=public as $$
declare v_mailbox_id uuid; v_line jsonb; v_article_id uuid; v_qty integer; v_price numeric(12,2); v_available integer; v_total numeric(12,2); v_remaining integer; v_assignment_id uuid; v_existing integer;
begin
 if not public.is_admin() then raise exception 'Operazione non autorizzata'; end if;
 select id into v_mailbox_id from public.mailboxes where upper(mailbox_code)=upper(btrim(p_customer_code));
 if v_mailbox_id is null then raise exception 'Codice casella non trovato: %',p_customer_code; end if;
 if p_lines is null or jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_lines)=0 then raise exception 'Nessun articolo selezionato'; end if;
 for v_line in select value from jsonb_array_elements(p_lines) loop
   v_article_id:=nullif(v_line->>'article_id','')::uuid; v_qty:=coalesce((v_line->>'quantity')::integer,0); v_price:=coalesce((v_line->>'price')::numeric,0);
   if v_article_id is null or v_qty<=0 or v_price<=0 then raise exception 'Quantità e prezzo devono essere maggiori di zero'; end if;
   select a.quantity_purchased-coalesce((select sum(m.quantity) from public.movements m where m.article_id=a.id and m.movement_type='VENDITA' and coalesce(m.quantity,0)>0 and not exists(select 1 from public.movements x where x.movement_type='ANNULLAMENTO' and x.reference_id=m.id)),0) into v_available from public.articles a where a.id=v_article_id and a.deleted_at is null for update;
   if v_available is null then raise exception 'Articolo non trovato o già eliminato: %',v_article_id; end if;
   if v_qty>v_available then raise exception 'Quantità non disponibile per articolo %: residua %',v_article_id,v_available; end if;
 end loop;
 for v_line in select value from jsonb_array_elements(p_lines) loop
   v_article_id:=(v_line->>'article_id')::uuid; v_qty:=(v_line->>'quantity')::integer; v_price:=(v_line->>'price')::numeric; v_total:=round(v_qty*v_price,2);
   select id,quantity_assigned into v_assignment_id,v_existing from public.article_assignments where article_id=v_article_id and mailbox_id=v_mailbox_id and status='ATTIVA' order by assigned_at,id limit 1 for update;
   if v_assignment_id is null then
     insert into public.article_assignments(article_id,mailbox_id,quantity_assigned,status,notes) values(v_article_id,v_mailbox_id,v_qty,'ATTIVA','Assegnazione da vendita') returning id into v_assignment_id;
   else
     update public.article_assignments set quantity_assigned=quantity_assigned+v_qty where id=v_assignment_id;
   end if;
   insert into public.movements(mailbox_id,movement_type,article_id,quantity,unit_price_eur,total_amount_eur,generic_customer_name,description,operator_user_id,movement_at)
   values(v_mailbox_id,'VENDITA',v_article_id,v_qty,v_price,v_total,upper(btrim(p_customer_code)),'Vendita articolo',auth.uid(),p_movement_date::timestamptz);
   select a.quantity_purchased-coalesce((select sum(m.quantity) from public.movements m where m.article_id=a.id and m.movement_type='VENDITA' and not exists(select 1 from public.movements x where x.movement_type='ANNULLAMENTO' and x.reference_id=m.id)),0) into v_remaining from public.articles a where a.id=v_article_id;
   update public.articles set status=case when v_remaining<=0 then 'VENDUTO' when status='IN_ARRIVO' then 'IN_ARRIVO' else 'IN_STOCK' end,updated_at=now() where id=v_article_id;
 end loop;
end; $$;
revoke all on function public.register_article_sales(text,jsonb,date) from public,anon;
grant execute on function public.register_article_sales(text,jsonb,date) to authenticated;

create or replace function public.register_customer_payment(p_mailbox_id uuid,p_amount numeric,p_currency text,p_exchange_rate numeric,p_payment_date date,p_payment_method text,p_notes text default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_payment_id uuid; v_payment_code text; v_amount_eur numeric(12,2); v_remaining numeric(12,2); v_sale record; v_open numeric(12,2); v_alloc numeric(12,2);
begin
 if not public.is_admin() then raise exception 'Operazione non autorizzata'; end if;
 if p_mailbox_id is null then raise exception 'Casella obbligatoria'; end if;
 if p_amount is null or p_amount<=0 then raise exception 'Importo non valido'; end if;
 if p_exchange_rate is null or p_exchange_rate<=0 then raise exception 'Cambio valuta non valido'; end if;
 v_amount_eur:=round(case when upper(coalesce(p_currency,'EUR'))='EUR' then p_amount else p_amount/p_exchange_rate end,2); v_payment_code:=public.next_entity_code('P');
 insert into public.payments(payment_code,mailbox_id,payment_date,amount,currency,exchange_rate,amount_eur,payment_method,status,notes,created_by) values(v_payment_code,p_mailbox_id,coalesce(p_payment_date,current_date),p_amount,upper(coalesce(p_currency,'EUR')),p_exchange_rate,v_amount_eur,p_payment_method,'RICEVUTO',p_notes,auth.uid()) returning id into v_payment_id;
 insert into public.movements(mailbox_id,movement_type,reference_id,reference_code,total_amount_eur,description,operator_user_id,notes,movement_at) values(p_mailbox_id,'PAGAMENTO',v_payment_id,v_payment_code,-v_amount_eur,'Pagamento registrato',auth.uid(),p_notes,coalesce(p_payment_date,current_date)::timestamptz);
 v_remaining:=v_amount_eur;
 for v_sale in select m.id,m.total_amount_eur,coalesce((select sum(pa.amount_eur) from public.payment_allocations pa where pa.movement_id=m.id),0) paid from public.movements m where m.mailbox_id=p_mailbox_id and m.movement_type='VENDITA' and coalesce(m.total_amount_eur,0)>0 and not exists(select 1 from public.movements x where x.movement_type='ANNULLAMENTO' and x.reference_id=m.id) order by m.movement_at,m.id for update loop
   v_open:=greatest(0,round(coalesce(v_sale.total_amount_eur,0)-coalesce(v_sale.paid,0),2)); if v_open<=0 then continue; end if; v_alloc:=least(v_remaining,v_open);
   if v_alloc>0 then insert into public.payment_allocations(payment_id,movement_id,amount_eur) values(v_payment_id,v_sale.id,v_alloc); v_remaining:=round(v_remaining-v_alloc,2); end if; if v_remaining<=0 then exit; end if;
 end loop;
 return v_payment_id;
end; $$;
revoke all on function public.register_customer_payment(uuid,numeric,text,numeric,date,text,text) from public,anon;
grant execute on function public.register_customer_payment(uuid,numeric,text,numeric,date,text,text) to authenticated;

-- Central sale cancellation. The original sale remains visible in history but is
-- neutralized (quantity/amount zero); an ANNULLAMENTO audit movement is added.
-- Only the amount actually paid on that sale becomes customer credit.
create or replace function public.cancel_article_sale(p_sale_movement_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare v_sale public.movements%rowtype; v_paid numeric(12,2); v_credit_id uuid; v_credit_code text; v_active_qty integer; v_assignment_id uuid;
begin
 if not public.is_admin() then raise exception 'Operazione non autorizzata'; end if;
 select * into v_sale from public.movements where id=p_sale_movement_id and movement_type='VENDITA' for update;
 if v_sale.id is null then raise exception 'Vendita non trovata'; end if;
 if exists(select 1 from public.movements where movement_type='ANNULLAMENTO' and reference_id=v_sale.id) then raise exception 'La vendita è già annullata'; end if;
 v_paid:=round(coalesce((select sum(pa.amount_eur) from public.payment_allocations pa where pa.movement_id=v_sale.id),0),2);
 update public.movements set quantity=0,total_amount_eur=0,description=concat_ws(' | ',description,'Vendita annullata'),notes=concat_ws(' | ',notes,'Annullamento vendita') where id=v_sale.id;
 insert into public.movements(mailbox_id,movement_type,reference_id,reference_code,article_id,quantity,total_amount_eur,description,operator_user_id,notes,movement_at) values(v_sale.mailbox_id,'ANNULLAMENTO',v_sale.id,v_sale.reference_code,v_sale.article_id,v_sale.quantity,0,'Annullamento vendita '||coalesce(v_sale.reference_code,v_sale.id::text),auth.uid(),'La vendita originale resta nello storico',now());
 if v_paid>0 and v_sale.mailbox_id is not null then
   v_credit_code:=public.next_entity_code('C');
   insert into public.credits(credit_code,mailbox_id,amount_eur,used_amount_eur,status,reason,notes,credit_date) values(v_credit_code,v_sale.mailbox_id,v_paid,0,'ATTIVO','Credito da annullamento vendita','Generato dall''annullamento della vendita '||coalesce(v_sale.reference_code,v_sale.id::text),current_date) returning id into v_credit_id;
   insert into public.movements(mailbox_id,movement_type,reference_id,reference_code,total_amount_eur,description,operator_user_id,movement_at) values(v_sale.mailbox_id,'CREDITO',v_credit_id,v_credit_code,-v_paid,'Credito da annullamento vendita '||coalesce(v_sale.reference_code,v_sale.id::text),auth.uid(),current_date::timestamptz);
 end if;
 select coalesce(sum(m.quantity),0)::integer into v_active_qty from public.movements m where m.article_id=v_sale.article_id and m.mailbox_id=v_sale.mailbox_id and m.movement_type='VENDITA' and coalesce(m.quantity,0)>0 and not exists(select 1 from public.movements x where x.movement_type='ANNULLAMENTO' and x.reference_id=m.id);
 select id into v_assignment_id from public.article_assignments where article_id=v_sale.article_id and mailbox_id=v_sale.mailbox_id and status='ATTIVA' order by assigned_at,id limit 1 for update;
 if v_assignment_id is not null then
   if v_active_qty>0 then update public.article_assignments set quantity_assigned=v_active_qty where id=v_assignment_id; update public.article_assignments set status='ANNULLATA' where article_id=v_sale.article_id and mailbox_id=v_sale.mailbox_id and status='ATTIVA' and id<>v_assignment_id;
   else update public.article_assignments set quantity_assigned=0,status='ANNULLATA' where article_id=v_sale.article_id and mailbox_id=v_sale.mailbox_id and status='ATTIVA'; end if;
 end if;
 update public.articles set status='IN_STOCK',updated_at=now() where id=v_sale.article_id;
end; $$;
revoke all on function public.cancel_article_sale(uuid) from public,anon;
grant execute on function public.cancel_article_sale(uuid) to authenticated;

create or replace function public.admin_delete_article(p_article_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare v_sale_id uuid; v_article public.articles%rowtype;
begin
 if not public.is_admin() then raise exception 'Operazione non autorizzata'; end if;
 select * into v_article from public.articles where id=p_article_id for update;
 if v_article.id is null then raise exception 'Articolo non trovato'; end if;
 if v_article.deleted_at is not null then raise exception 'Articolo già eliminato'; end if;
 if exists(select 1 from public.shipment_items si join public.shipments s on s.id=si.shipment_id where si.article_id=p_article_id and s.status<>'ANNULLATA') then raise exception 'Impossibile eliminare l''articolo: è presente in una spedizione attiva'; end if;
 for v_sale_id in select m.id from public.movements m where m.article_id=p_article_id and m.movement_type='VENDITA' and coalesce(m.quantity,0)>0 and not exists(select 1 from public.movements x where x.movement_type='ANNULLAMENTO' and x.reference_id=m.id) order by m.movement_at,m.id loop perform public.cancel_article_sale(v_sale_id); end loop;
 update public.article_assignments set quantity_assigned=0,status='ANNULLATA' where article_id=p_article_id and status='ATTIVA';
 update public.articles set deleted_at=now(),deleted_reason='Eliminato dall''Archivio',updated_at=now() where id=p_article_id;
 insert into public.movements(movement_type,reference_id,reference_code,article_id,total_amount_eur,description,operator_user_id,notes) values('ANNULLAMENTO',p_article_id,v_article.article_code,p_article_id,0,'Articolo eliminato dall''Archivio',auth.uid(),'Le vendite collegate sono state annullate; lo storico è conservato');
end; $$;
revoke all on function public.admin_delete_article(uuid) from public,anon;
grant execute on function public.admin_delete_article(uuid) to authenticated;

create or replace function public.admin_create_customer_mailbox(p_email text,p_first_name text,p_last_name text,p_notes text default null,p_opened_at date default current_date,p_phone text default null,p_shipping_address text default null,p_shipping_city text default null,p_shipping_country text default null,p_shipping_postal_code text default null,p_status text default 'ATTIVA') returns jsonb language plpgsql security definer set search_path=public as $$
declare v_customer_id uuid; v_mailbox_id uuid; v_mailbox_code text;
begin
 if not public.is_admin() then raise exception 'Operazione non autorizzata'; end if;
 if btrim(coalesce(p_first_name,''))='' or btrim(coalesce(p_last_name,''))='' then raise exception 'Nome e cognome sono obbligatori'; end if;
 if p_status not in ('ATTIVA','SOSPESA','CHIUSA') then raise exception 'Stato casella non valido'; end if;
 insert into public.customers(first_name,last_name,phone,email,shipping_address,shipping_city,shipping_postal_code,shipping_country) values(btrim(p_first_name),btrim(p_last_name),nullif(btrim(p_phone),''),nullif(btrim(p_email),''),nullif(btrim(p_shipping_address),''),nullif(btrim(p_shipping_city),''),nullif(btrim(p_shipping_postal_code),''),nullif(btrim(p_shipping_country),'')) returning id into v_customer_id;
 insert into public.mailboxes(customer_id,status,opened_at,notes) values(v_customer_id,p_status,coalesce(p_opened_at,current_date),nullif(btrim(p_notes),'')) returning id,mailbox_code into v_mailbox_id,v_mailbox_code;
 insert into public.movements(mailbox_id,movement_type,reference_id,reference_code,description,operator_user_id) values(v_mailbox_id,'NUOVO_UTENTE',v_customer_id,v_mailbox_code,'Nuovo cliente e casella creati',auth.uid());
 return jsonb_build_object('customer_id',v_customer_id,'mailbox_id',v_mailbox_id,'mailbox_code',v_mailbox_code);
end; $$;
revoke all on function public.admin_create_customer_mailbox(text,text,text,text,date,text,text,text,text,text,text) from public,anon;
grant execute on function public.admin_create_customer_mailbox(text,text,text,text,date,text,text,text,text,text,text) to authenticated;

create or replace function public.admin_update_mailbox_code(p_mailbox_id uuid,p_mailbox_code text) returns text language plpgsql security definer set search_path=public as $$
declare v_code text:=upper(btrim(coalesce(p_mailbox_code,''))); v_old text; v_exists uuid;
begin
 if not public.is_admin() then raise exception 'Operazione non autorizzata'; end if;
 select mailbox_code into v_old from public.mailboxes where id=p_mailbox_id for update;
 if v_old is null then raise exception 'Casella non trovata'; end if;
 if length(v_code)<3 or length(v_code)>20 or v_code !~ '^[A-Z0-9]+$' then raise exception 'Il codice cliente non è valido'; end if;
 select id into v_exists from public.mailboxes where upper(mailbox_code)=v_code and id<>p_mailbox_id limit 1;
 if v_exists is not null then raise exception 'Il codice cliente % è già utilizzato',v_code; end if;
 update public.mailboxes set mailbox_code=v_code,updated_at=now() where id=p_mailbox_id;
 update public.movements set reference_code=v_code where mailbox_id=p_mailbox_id and movement_type='NUOVO_UTENTE' and (reference_code=v_old or reference_code is null);
 update public.movements set generic_customer_name=v_code where mailbox_id=p_mailbox_id and movement_type='VENDITA' and (generic_customer_name=v_old or generic_customer_name is null);
 return v_code;
end; $$;
revoke all on function public.admin_update_mailbox_code(uuid,text) from public,anon;
grant execute on function public.admin_update_mailbox_code(uuid,text) to authenticated;

create or replace function public.cancel_customer_shipment(p_shipment_id uuid) returns void language plpgsql security definer set search_path=public as $$
declare v_shipment public.shipments%rowtype; v_payment public.payments%rowtype; v_amount numeric;
begin
 if not public.is_admin() then raise exception 'Operazione non autorizzata'; end if;
 select * into v_shipment from public.shipments where id=p_shipment_id for update;
 if v_shipment.id is null then raise exception 'Spedizione non trovata'; end if;
 if v_shipment.status='ANNULLATA' then raise exception 'La spedizione era già annullata'; end if;
 update public.movements set total_amount_eur=0 where reference_id=v_shipment.id and movement_type='SPEDIZIONE';
 if coalesce(v_shipment.shipping_cost_eur,0)>0 then insert into public.movements(mailbox_id,movement_type,reference_id,reference_code,total_amount_eur,description,operator_user_id) values(v_shipment.mailbox_id,'STORNO',v_shipment.id,v_shipment.shipment_code,-v_shipment.shipping_cost_eur,'Storno costo spedizione '||v_shipment.shipment_code,auth.uid()); end if;
 for v_payment in select * from public.payments where mailbox_id=v_shipment.mailbox_id and status<>'ANNULLATO' and (reference=v_shipment.shipment_code or (payment_method='SPEDIZIONE' and notes ilike '%'||v_shipment.shipment_code||'%')) for update loop
   v_amount:=coalesce(v_payment.amount_eur,0); delete from public.payment_allocations where payment_id=v_payment.id; update public.payments set status='ANNULLATO' where id=v_payment.id; update public.movements set total_amount_eur=-v_amount,notes=concat_ws(' | ',notes,'Pagamento annullato per annullamento spedizione') where reference_id=v_payment.id and movement_type='PAGAMENTO';
   if v_amount>0 then insert into public.movements(mailbox_id,movement_type,reference_id,reference_code,total_amount_eur,description,operator_user_id) values(v_shipment.mailbox_id,'STORNO',v_payment.id,v_payment.payment_code,v_amount,'Storno pagamento spedizione '||v_shipment.shipment_code,auth.uid()); end if;
 end loop;
 update public.shipments set status='ANNULLATA' where id=p_shipment_id;
end; $$;
revoke all on function public.cancel_customer_shipment(uuid) from public,anon;
grant execute on function public.cancel_customer_shipment(uuid) to authenticated;

create or replace function public.admin_delete_customer(p_customer_id uuid) returns void language plpgsql security definer set search_path=public as $$
declare v_mailbox_ids uuid[]; v_user_ids uuid[];
begin
 if not public.is_admin() then raise exception 'Operazione non autorizzata'; end if;
 if not exists(select 1 from public.customers where id=p_customer_id) then raise exception 'Cliente non trovato'; end if;
 select coalesce(array_agg(id),array[]::uuid[]) into v_mailbox_ids from public.mailboxes where customer_id=p_customer_id;
 if exists(select 1 from public.movements where mailbox_id=any(v_mailbox_ids)) then raise exception 'Impossibile cancellare il cliente: esistono movimenti storici associati'; end if;
 if exists(select 1 from public.payments where mailbox_id=any(v_mailbox_ids)) then raise exception 'Impossibile cancellare il cliente: esistono pagamenti associati'; end if;
 if exists(select 1 from public.credits where mailbox_id=any(v_mailbox_ids)) then raise exception 'Impossibile cancellare il cliente: esistono crediti associati'; end if;
 if exists(select 1 from public.article_assignments where mailbox_id=any(v_mailbox_ids)) then raise exception 'Impossibile cancellare il cliente: esistono articoli assegnati'; end if;
 if exists(select 1 from public.shipment_items where mailbox_id=any(v_mailbox_ids)) then raise exception 'Impossibile cancellare il cliente: esistono articoli in spedizioni'; end if;
 if exists(select 1 from public.shipments where mailbox_id=any(v_mailbox_ids)) then raise exception 'Impossibile cancellare il cliente: esistono spedizioni associate'; end if;
 select coalesce(array_agg(user_id),array[]::uuid[]) into v_user_ids from public.profiles where customer_id=p_customer_id or mailbox_id=any(v_mailbox_ids);
 delete from public.profiles where customer_id=p_customer_id or mailbox_id=any(v_mailbox_ids); delete from public.mailboxes where customer_id=p_customer_id; delete from public.customers where id=p_customer_id;
 if array_length(v_user_ids,1) is not null then delete from auth.users where id=any(v_user_ids); end if;
end; $$;
revoke all on function public.admin_delete_customer(uuid) from public,anon;
grant execute on function public.admin_delete_customer(uuid) to authenticated;

insert into storage.buckets(id,name,public) values('article-photos','article-photos',true) on conflict(id) do update set public=true;
drop policy if exists article_photos_admin_insert on storage.objects;
create policy article_photos_admin_insert on storage.objects for insert to authenticated with check(bucket_id='article-photos' and public.is_admin());
drop policy if exists article_photos_admin_update on storage.objects;
create policy article_photos_admin_update on storage.objects for update to authenticated using(bucket_id='article-photos' and public.is_admin()) with check(bucket_id='article-photos' and public.is_admin());
drop policy if exists article_photos_admin_delete on storage.objects;
create policy article_photos_admin_delete on storage.objects for delete to authenticated using(bucket_id='article-photos' and public.is_admin());
drop policy if exists article_photos_public_read on storage.objects;
create policy article_photos_public_read on storage.objects for select to public using(bucket_id='article-photos');

notify pgrst,'reload schema';
commit;
