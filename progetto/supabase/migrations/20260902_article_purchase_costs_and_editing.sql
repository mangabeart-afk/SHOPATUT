ALTER TABLE public.articles
  ADD COLUMN IF NOT EXISTS commission_cost numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS commission_currency text NOT NULL DEFAULT 'EUR',
  ADD COLUMN IF NOT EXISTS commission_exchange_rate numeric NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS customs_cost numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS customs_currency text NOT NULL DEFAULT 'EUR',
  ADD COLUMN IF NOT EXISTS customs_exchange_rate numeric NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS shipping_cost numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS shipping_currency text NOT NULL DEFAULT 'EUR',
  ADD COLUMN IF NOT EXISTS shipping_exchange_rate numeric NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS seller_page_url text;

CREATE OR REPLACE FUNCTION public.recalculate_article_costs()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  purchase_eur numeric;
  commission_eur numeric;
  customs_eur numeric;
  shipping_eur numeric;
BEGIN
  purchase_eur := COALESCE(NEW.unit_price_foreign, 0) * COALESCE(NEW.quantity_purchased, 0) *
    CASE WHEN upper(COALESCE(NEW.currency, 'EUR')) = 'EUR' THEN 1 ELSE COALESCE(NEW.exchange_rate, 1) END;

  commission_eur := COALESCE(NEW.commission_cost, 0) *
    CASE WHEN upper(COALESCE(NEW.commission_currency, 'EUR')) = 'EUR' THEN 1 ELSE COALESCE(NEW.commission_exchange_rate, 1) END;

  customs_eur := COALESCE(NEW.customs_cost, 0) *
    CASE WHEN upper(COALESCE(NEW.customs_currency, 'EUR')) = 'EUR' THEN 1 ELSE COALESCE(NEW.customs_exchange_rate, 1) END;

  shipping_eur := COALESCE(NEW.shipping_cost, 0) *
    CASE WHEN upper(COALESCE(NEW.shipping_currency, 'EUR')) = 'EUR' THEN 1 ELSE COALESCE(NEW.shipping_exchange_rate, 1) END;

  NEW.accessory_cost_eur := commission_eur + customs_eur + shipping_eur;
  NEW.total_cost_eur := purchase_eur + NEW.accessory_cost_eur;
  NEW.unit_cost_eur := CASE WHEN COALESCE(NEW.quantity_purchased, 0) > 0 THEN NEW.total_cost_eur / NEW.quantity_purchased ELSE 0 END;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_recalculate_article_costs ON public.articles;
CREATE TRIGGER trg_recalculate_article_costs
BEFORE INSERT OR UPDATE OF quantity_purchased, currency, unit_price_foreign, exchange_rate,
  commission_cost, commission_currency, commission_exchange_rate,
  customs_cost, customs_currency, customs_exchange_rate,
  shipping_cost, shipping_currency, shipping_exchange_rate
ON public.articles
FOR EACH ROW EXECUTE FUNCTION public.recalculate_article_costs();

UPDATE public.articles
SET
  commission_cost = COALESCE(commission_cost, 0),
  customs_cost = COALESCE(customs_cost, 0),
  shipping_cost = COALESCE(shipping_cost, 0),
  commission_currency = COALESCE(NULLIF(commission_currency, ''), 'EUR'),
  customs_currency = COALESCE(NULLIF(customs_currency, ''), 'EUR'),
  shipping_currency = COALESCE(NULLIF(shipping_currency, ''), 'EUR'),
  commission_exchange_rate = COALESCE(NULLIF(commission_exchange_rate, 0), 1),
  customs_exchange_rate = COALESCE(NULLIF(customs_exchange_rate, 0), 1),
  shipping_exchange_rate = COALESCE(NULLIF(shipping_exchange_rate, 0), 1);
