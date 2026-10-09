-- ShopATUT - rimozione definitiva dei dati inseriti durante le prove.
-- Clienti: 2609DLL, 2608TST, 2609TGL, 2609NGR, 2609LPN
-- Articoli: A26/0001 - A26/0018
begin;

create temporary table _test_customer_ids on commit drop as
select id from public.customers
where customer_code in ('2609DLL','2608TST','2609TGL','2609NGR','2609LPN');

create temporary table _test_mailbox_ids on commit drop as
select id from public.mailboxes
where customer_id in (select id from _test_customer_ids);

create temporary table _test_article_ids on commit drop as
select id from public.articles
where article_code >= 'A26/0001' and article_code <= 'A26/0018';

delete from public.payment_allocations
where payment_id in (
  select p.id from public.payments p
  where p.mailbox_id in (select id from _test_mailbox_ids)
)
or movement_id in (
  select m.id from public.movements m
  where m.mailbox_id in (select id from _test_mailbox_ids)
     or m.article_id in (select id from _test_article_ids)
     or m.reference_code in ('2609DLL','2608TST','2609TGL','2609NGR','2609LPN')
);

delete from public.shipment_items
where mailbox_id in (select id from _test_mailbox_ids)
   or article_id in (select id from _test_article_ids);

delete from public.movements
where mailbox_id in (select id from _test_mailbox_ids)
   or article_id in (select id from _test_article_ids)
   or reference_code in ('2609DLL','2608TST','2609TGL','2609NGR','2609LPN');

delete from public.article_assignments
where article_id in (select id from _test_article_ids)
   or mailbox_id in (select id from _test_mailbox_ids);

delete from public.payments
where mailbox_id in (select id from _test_mailbox_ids);

delete from public.credits
where mailbox_id in (select id from _test_mailbox_ids);

delete from public.shipments
where mailbox_id in (select id from _test_mailbox_ids);

delete from public.profiles
where customer_id in (select id from _test_customer_ids)
   or mailbox_id in (select id from _test_mailbox_ids);

delete from public.mailboxes
where id in (select id from _test_mailbox_ids);

delete from public.articles
where id in (select id from _test_article_ids);

delete from public.customers
where id in (select id from _test_customer_ids);

commit;
