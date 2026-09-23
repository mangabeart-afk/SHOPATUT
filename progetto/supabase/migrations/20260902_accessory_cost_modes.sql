ALTER TABLE public.articles
  ADD COLUMN IF NOT EXISTS commission_mode text NOT NULL DEFAULT 'FIXED',
  ADD COLUMN IF NOT EXISTS commission_percent numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS customs_mode text NOT NULL DEFAULT 'FIXED',
  ADD COLUMN IF NOT EXISTS customs_percent numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS shipping_mode text NOT NULL DEFAULT 'FIXED',
  ADD COLUMN IF NOT EXISTS shipping_percent numeric NOT NULL DEFAULT 0;

UPDATE public.articles
SET
  commission_mode = COALESCE(NULLIF(commission_mode, ''), 'FIXED'),
  commission_percent = COALESCE(commission_percent, 0),
  customs_mode = COALESCE(NULLIF(customs_mode, ''), 'FIXED'),
  customs_percent = COALESCE(customs_percent, 0),
  shipping_mode = COALESCE(NULLIF(shipping_mode, ''), 'FIXED'),
  shipping_percent = COALESCE(shipping_percent, 0);

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

  commission_eur := CASE
    WHEN upper(COALESCE(NEW.commission_mode, 'FIXED')) = 'PERCENT'
      THEN purchase_eur * GREATEST(COALESCE(NEW.commission_percent, 0), 0) / 100
    ELSE COALESCE(NEW.commission_cost, 0) *
      CASE WHEN upper(COALESCE(NEW.commission_currency, 'EUR')) = 'EUR' THEN 1 ELSE COALESCE(NEW.commission_exchange_rate, 1) END
  END;

  customs_eur := CASE
    WHEN upper(COALESCE(NEW.customs_mode, 'FIXED')) = 'PERCENT'
      THEN purchase_eur * GREATEST(COALESCE(NEW.customs_percent, 0), 0) / 100
    ELSE COALESCE(NEW.customs_cost, 0) *
      CASE WHEN upper(COALESCE(NEW.customs_currency, 'EUR')) = 'EUR' THEN 1 ELSE COALESCE(NEW.customs_exchange_rate, 1) END
  END;

  shipping_eur := CASE
    WHEN upper(COALESCE(NEW.shipping_mode, 'FIXED')) = 'PERCENT'
      THEN purchase_eur * GREATEST(COALESCE(NEW.shipping_percent, 0), 0) / 100
    ELSE COALESCE(NEW.shipping_cost, 0) *
      CASE WHEN upper(COALESCE(NEW.shipping_currency, 'EUR')) = 'EUR' THEN 1 ELSE COALESCE(NEW.shipping_exchange_rate, 1) END
  END;

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
  commission_mode, commission_cost, commission_percent, commission_currency, commission_exchange_rate,
  customs_mode, customs_cost, customs_percent, customs_currency, customs_exchange_rate,
  shipping_mode, shipping_cost, shipping_percent, shipping_currency, shipping_exchange_rate
ON public.articles
FOR EACH ROW EXECUTE FUNCTION public.recalculate_article_costs();

UPDATE public.articles
SET
  commission_mode = CASE WHEN upper(COALESCE(commission_mode, 'FIXED')) = 'PERCENT' THEN 'PERCENT' ELSE 'FIXED' END,
  customs_mode = CASE WHEN upper(COALESCE(customs_mode, 'FIXED')) = 'PERCENT' THEN 'PERCENT' ELSE 'FIXED' END,
  shipping_mode = CASE WHEN upper(COALESCE(shipping_mode, 'FIXED')) = 'PERCENT' THEN 'PERCENT' ELSE 'FIXED' END;
