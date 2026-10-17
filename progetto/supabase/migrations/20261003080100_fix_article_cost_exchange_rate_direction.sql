-- SHOPATUT 03/10/2026
-- All exchange rates follow the UI convention: 1 EUR = N units of foreign currency.
-- Therefore foreign-currency amounts are converted to EUR by division, not multiplication.

ALTER TABLE public.articles
  DROP COLUMN IF EXISTS total_cost_eur,
  DROP COLUMN IF EXISTS unit_cost_eur;

ALTER TABLE public.articles
  ADD COLUMN total_cost_eur numeric
  GENERATED ALWAYS AS (
    round(
      (
        (((quantity_purchased::numeric * unit_price_foreign) / NULLIF(exchange_rate, 0))
         + accessory_cost_eur)
        + CASE
            WHEN commission_type = 'PERCENT'
              THEN (((quantity_purchased::numeric * unit_price_foreign) / NULLIF(exchange_rate, 0)) * commission_percent / 100)
            ELSE commission_cost / NULLIF(commission_exchange_rate, 0)
          END
        + CASE
            WHEN customs_type = 'PERCENT'
              THEN (((quantity_purchased::numeric * unit_price_foreign) / NULLIF(exchange_rate, 0)) * customs_percent / 100)
            ELSE customs_cost / NULLIF(customs_exchange_rate, 0)
          END
        + CASE
            WHEN shipping_type = 'PERCENT'
              THEN (((quantity_purchased::numeric * unit_price_foreign) / NULLIF(exchange_rate, 0)) * shipping_percent / 100)
            ELSE shipping_cost / NULLIF(shipping_exchange_rate, 0)
          END
      ), 2
    )
  ) STORED;

ALTER TABLE public.articles
  ADD COLUMN unit_cost_eur numeric
  GENERATED ALWAYS AS (
    round(
      (
        (
          (((quantity_purchased::numeric * unit_price_foreign) / NULLIF(exchange_rate, 0))
           + accessory_cost_eur)
          + CASE
              WHEN commission_type = 'PERCENT'
                THEN (((quantity_purchased::numeric * unit_price_foreign) / NULLIF(exchange_rate, 0)) * commission_percent / 100)
              ELSE commission_cost / NULLIF(commission_exchange_rate, 0)
            END
          + CASE
              WHEN customs_type = 'PERCENT'
                THEN (((quantity_purchased::numeric * unit_price_foreign) / NULLIF(exchange_rate, 0)) * customs_percent / 100)
              ELSE customs_cost / NULLIF(customs_exchange_rate, 0)
            END
          + CASE
              WHEN shipping_type = 'PERCENT'
                THEN (((quantity_purchased::numeric * unit_price_foreign) / NULLIF(exchange_rate, 0)) * shipping_percent / 100)
              ELSE shipping_cost / NULLIF(shipping_exchange_rate, 0)
            END
        ) / NULLIF(quantity_purchased::numeric, 0)
      ), 4
    )
  ) STORED;

NOTIFY pgrst, 'reload schema';
