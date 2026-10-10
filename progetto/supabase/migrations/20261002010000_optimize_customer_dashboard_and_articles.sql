create or replace function public.customer_dashboard_summary()
returns table (
  customer_id uuid,
  customer_first_name text,
  customer_last_name text,
  customer_email text,
  customer_phone text,
  shipping_address text,
  shipping_city text,
  shipping_postal_code text,
  shipping_country text,
  customer_created_at timestamptz,
  mailbox_id uuid,
  mailbox_code text,
  mailbox_status text,
  balance_eur numeric,
  in_stock numeric,
  in_arrivo numeric,
  recent_movements jsonb
)
language sql
security invoker
set search_path = public
as $$
  with me as (
    select p.customer_id, p.mailbox_id
    from public.profiles p
    where p.user_id = (select auth.uid())
    limit 1
  ),
  c as (
    select c.* from public.customers c join me on me.customer_id = c.id
  ),
  m as (
    select m.* from public.mailboxes m join me on me.mailbox_id = m.id
  ),
  assignments as (
    select aa.article_id, aa.quantity_assigned
    from public.article_assignments aa
    join me on me.mailbox_id = aa.mailbox_id
    where aa.status = 'ATTIVA'
  ),
  stock as (
    select
      coalesce(sum(case when a.status = 'IN_STOCK' then aa.quantity_assigned else 0 end),0) as in_stock,
      coalesce(sum(case when a.status = 'IN_ARRIVO' then aa.quantity_assigned else 0 end),0) as in_arrivo
    from assignments aa join public.articles a on a.id = aa.article_id
  ),
  balance as (
    select coalesce(sum(mv.total_amount_eur),0) as balance_eur
    from public.movements mv join me on me.mailbox_id = mv.mailbox_id
  ),
  recent as (
    select coalesce(jsonb_agg(to_jsonb(x) order by x.movement_at desc, x.id desc),'[]'::jsonb) as recent_movements
    from (
      select mv.id, mv.movement_code, mv.movement_type, mv.total_amount_eur, mv.movement_at, mv.description
      from public.movements mv join me on me.mailbox_id = mv.mailbox_id
      order by mv.movement_at desc nulls last, mv.id desc
      limit 5
    ) x
  )
  select c.id, c.first_name, c.last_name, c.email, c.phone,
    c.shipping_address, c.shipping_city, c.shipping_postal_code, c.shipping_country,
    c.created_at, m.id, m.mailbox_code::text, m.status::text,
    b.balance_eur, s.in_stock, s.in_arrivo, r.recent_movements
  from c left join m on true cross join balance b cross join stock s cross join recent r;
$$;
revoke all on function public.customer_dashboard_summary() from public, anon;
grant execute on function public.customer_dashboard_summary() to authenticated;

create or replace function public.customer_article_list(p_search text default '')
returns table (
  article_id uuid, assignment_id uuid, quantity_assigned numeric, assigned_at timestamptz,
  assignment_notes text, article_code text, photo_url text, purchase_date timestamptz,
  origin text, series text, detail text, article_status text, article_notes text,
  latest_unit_price_eur numeric, shipped_quantity numeric, shipment_code text,
  shipment_id uuid, shipment_status text
)
language sql
security invoker
set search_path = public
as $$
  with me as (
    select p.mailbox_id from public.profiles p
    where p.user_id = (select auth.uid()) limit 1
  ),
  latest_sale as (
    select distinct on (mv.article_id) mv.article_id, mv.unit_price_eur
    from public.movements mv join me on me.mailbox_id = mv.mailbox_id
    where mv.movement_type = 'VENDITA'
    order by mv.article_id, mv.movement_at desc nulls last, mv.id desc
  ),
  shipped as (
    select si.article_id,
      coalesce(sum(si.quantity_shipped),0) as shipped_quantity,
      max(s.shipment_code) as shipment_code,
      max(s.id::text)::uuid as shipment_id,
      max(s.status::text) as shipment_status
    from public.shipment_items si
    join me on me.mailbox_id = si.mailbox_id
    join public.shipments s on s.id = si.shipment_id
    group by si.article_id
  )
  select a.id, aa.id, aa.quantity_assigned, aa.assigned_at, aa.notes,
    a.article_code, a.photo_url, a.purchase_date, a.origin, a.series, a.detail,
    a.status::text, a.notes, ls.unit_price_eur, coalesce(sh.shipped_quantity,0),
    sh.shipment_code, sh.shipment_id, sh.shipment_status
  from public.article_assignments aa
  join me on me.mailbox_id = aa.mailbox_id
  join public.articles a on a.id = aa.article_id
  left join latest_sale ls on ls.article_id = a.id
  left join shipped sh on sh.article_id = a.id
  where aa.status = 'ATTIVA'
    and (coalesce(p_search,'') = '' or a.article_code ilike '%' || p_search || '%'
      or a.series ilike '%' || p_search || '%' or a.detail ilike '%' || p_search || '%'
      or a.origin ilike '%' || p_search || '%')
  order by a.purchase_date desc nulls last, a.id;
$$;
revoke all on function public.customer_article_list(text) from public, anon;
grant execute on function public.customer_article_list(text) to authenticated;
