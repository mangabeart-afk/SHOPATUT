-- SHOPATUT 08/10/2026
-- Sincronizzazione incrementale con MangaBEART(5).xlsx.
-- Applicata al progetto Supabase: nuovi articoli, nuovo movimento cliente
-- e riallineamento dei saldi Excel.

begin;

insert into public.articles (
  article_code,purchase_date,origin,seller,series,article_type,detail,
  quantity_purchased,currency,unit_price_foreign,exchange_rate,
  accessory_cost_eur,commission_mode,commission_cost,commission_percent,
  commission_currency,commission_exchange_rate,
  customs_mode,customs_cost,customs_percent,customs_currency,customs_exchange_rate,
  shipping_mode,shipping_cost,shipping_percent,shipping_currency,shipping_exchange_rate,
  notes,status
) values
(
 'A26/0498','2024-01-01','GIAPPONE','Mek790','ONE PIECE','VARIANT','BOBBLE',
 1,'EUR',50,1,0,'FIXED',0,0,'EUR',1,
 'PERCENT',0,0,'EUR',1,'FIXED',0,0,'EUR',1,'X-97','IN_STOCK'
),
(
 'A26/0499','2024-04-01','GIAPPONE',null,'WEEKLY SHONEN JUMP','ALTRO','50th Anniversary Weekly Shonen Jump Exhibition VOL.3',
 1,'JPY',7130,163,0,'FIXED',0,0,'EUR',1,
 'PERCENT',0,0,'EUR',1,'FIXED',0.70,0,'EUR',1,'Y-315','IN_STOCK'
),
(
 'A26/0500','2024-04-01','GIAPPONE',null,'WEEKLY SHONEN JUMP','BOOKLET','JUMP ULTIMATE STARS',
 1,'JPY',2100,163,0,'FIXED',0,0,'EUR',1,
 'PERCENT',0,0,'EUR',1,'FIXED',5,0,'EUR',1,'Y-316','IN_STOCK'
);

-- Il trigger di calcolo dei costi usa la logica applicativa corrente;
-- per questi tre record manteniamo i valori calcolati dal foglio Excel.
update public.articles set
  total_cost_eur=50.00, unit_cost_eur=50.00, accessory_cost_eur=0
where article_code='A26/0498';

update public.articles set
  total_cost_eur=57.1331288343558,
  unit_cost_eur=57.1331288343558,
  accessory_cost_eur=13.3907975404902
where article_code='A26/0499';

update public.articles set
  total_cost_eur=23.7852760736196,
  unit_cost_eur=23.7852760736196,
  accessory_cost_eur=10.9018407973006
where article_code='A26/0500';

insert into public.movements(
  movement_type,reference_id,reference_code,article_id,quantity,total_amount_eur,
  description,movement_at
)
select 'ARTICOLO',a.id,a.article_code,a.id,a.quantity_purchased,a.total_cost_eur,
       'Creazione da migrazione Excel 2026-10-08',a.purchase_date::timestamptz
from public.articles a
where a.article_code in ('A26/0498','A26/0499','A26/0500');

insert into public.movements(
  mailbox_id,movement_type,reference_id,reference_code,quantity,
  total_amount_eur,description,movement_at
)
select mb.id,'ALTRO',c.id,c.customer_code,1,230,
       'KAKEGURUI VARIANT VOL. 1','2026-10-08'::date
from public.customers c
join public.mailboxes mb on mb.customer_id=c.id
where c.customer_code='2510MCR';

delete from public.movements
where movement_type='MODIFICA'
  and description='Rettifica saldo migrazione Excel 2026-10-07'
  and mailbox_id in (
    select mb.id from public.mailboxes mb
    join public.customers c on c.id=mb.customer_id
    where c.customer_code in ('FRENCY','2410VGL','2601TVN')
  );

insert into public.movements(
  mailbox_id,movement_type,reference_id,reference_code,total_amount_eur,
  description,movement_at
)
select mb.id,'MODIFICA',c.id,c.customer_code,136.91,
       'Rettifica saldo migrazione Excel 2026-10-08','2026-10-08'::date
from public.customers c
join public.mailboxes mb on mb.customer_id=c.id
where c.customer_code='FRENCY';

commit;
