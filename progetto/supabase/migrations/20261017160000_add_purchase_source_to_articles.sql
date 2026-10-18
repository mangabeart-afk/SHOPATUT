-- Store the acquisition channel separately from the geographic origin and seller name.
ALTER TABLE public.articles
  ADD COLUMN IF NOT EXISTS purchase_source text NOT NULL DEFAULT 'ALTRO';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'articles_purchase_source_check'
       AND conrelid = 'public.articles'::regclass
  ) THEN
    ALTER TABLE public.articles
      ADD CONSTRAINT articles_purchase_source_check
      CHECK (purchase_source = ANY (ARRAY['NEGOZIO'::text, 'ONLINE'::text, 'FORNITORE'::text, 'ALTRO'::text]));
  END IF;
END $$;

COMMENT ON COLUMN public.articles.purchase_source IS 'Canale di acquisto: NEGOZIO, ONLINE, FORNITORE oppure ALTRO. Distinto dalla provenienza geografica origin.';

-- Include purchase_source in the transactional article-creation RPC.
CREATE OR REPLACE FUNCTION public.admin_create_article(p_article jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_article public.articles%ROWTYPE;
  v_user uuid := auth.uid();
  v_quantity integer;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Operazione non autorizzata';
  END IF;
  IF p_article IS NULL OR jsonb_typeof(p_article) <> 'object' THEN
    RAISE EXCEPTION 'Dati articolo non validi';
  END IF;
  v_quantity := COALESCE(NULLIF(p_article->>'quantity_purchased','')::integer, 0);
  IF v_quantity <= 0 THEN
    RAISE EXCEPTION 'La quantità deve essere maggiore di zero';
  END IF;
  IF COALESCE(NULLIF(p_article->>'exchange_rate','')::numeric, 1) <= 0
     OR COALESCE(NULLIF(p_article->>'commission_exchange_rate','')::numeric, 1) <= 0
     OR COALESCE(NULLIF(p_article->>'customs_exchange_rate','')::numeric, 1) <= 0
     OR COALESCE(NULLIF(p_article->>'shipping_exchange_rate','')::numeric, 1) <= 0 THEN
    RAISE EXCEPTION 'Uno o più cambi valuta non sono validi';
  END IF;
  INSERT INTO public.articles(
    purchase_date, origin, purchase_source, article_type, seller, series, detail,
    quantity_purchased, currency, unit_price_foreign, exchange_rate,
    commission_mode, commission_cost, commission_percent, commission_currency, commission_exchange_rate,
    customs_mode, customs_cost, customs_percent, customs_currency, customs_exchange_rate,
    shipping_mode, shipping_cost, shipping_percent, shipping_currency, shipping_exchange_rate,
    notes, status
  ) VALUES (
    COALESCE(NULLIF(p_article->>'purchase_date','')::date, CURRENT_DATE),
    COALESCE(NULLIF(p_article->>'origin',''),'GIAPPONE'),
    COALESCE(NULLIF(p_article->>'purchase_source',''),'ALTRO'),
    COALESCE(NULLIF(p_article->>'article_type',''),'ALTRO'),
    NULLIF(p_article->>'seller',''), NULLIF(p_article->>'series',''), NULLIF(p_article->>'detail',''),
    v_quantity,
    upper(COALESCE(NULLIF(p_article->>'currency',''),'EUR')),
    COALESCE(NULLIF(p_article->>'unit_price_foreign','')::numeric,0),
    COALESCE(NULLIF(p_article->>'exchange_rate','')::numeric,1),
    COALESCE(NULLIF(p_article->>'commission_type',''), NULLIF(p_article->>'commission_mode',''), 'FIXED'),
    COALESCE(NULLIF(p_article->>'commission_cost','')::numeric,0),
    COALESCE(NULLIF(p_article->>'commission_percent','')::numeric,0),
    upper(COALESCE(NULLIF(p_article->>'commission_currency',''),'EUR')),
    COALESCE(NULLIF(p_article->>'commission_exchange_rate','')::numeric,1),
    COALESCE(NULLIF(p_article->>'customs_type',''), NULLIF(p_article->>'customs_mode',''), 'FIXED'),
    COALESCE(NULLIF(p_article->>'customs_cost','')::numeric,0),
    COALESCE(NULLIF(p_article->>'customs_percent','')::numeric,0),
    upper(COALESCE(NULLIF(p_article->>'customs_currency',''),'EUR')),
    COALESCE(NULLIF(p_article->>'customs_exchange_rate','')::numeric,1),
    COALESCE(NULLIF(p_article->>'shipping_type',''), NULLIF(p_article->>'shipping_mode',''), 'FIXED'),
    COALESCE(NULLIF(p_article->>'shipping_cost','')::numeric,0),
    COALESCE(NULLIF(p_article->>'shipping_percent','')::numeric,0),
    upper(COALESCE(NULLIF(p_article->>'shipping_currency',''),'EUR')),
    COALESCE(NULLIF(p_article->>'shipping_exchange_rate','')::numeric,1),
    NULLIF(p_article->>'notes',''),
    COALESCE(NULLIF(p_article->>'status',''),'IN_ARRIVO')
  ) RETURNING * INTO v_article;
  INSERT INTO public.movements(
    movement_type, reference_id, reference_code, article_id, quantity,
    total_amount_eur, description, operator_user_id, movement_at
  ) VALUES (
    'ARTICOLO', v_article.id, v_article.article_code, v_article.id,
    v_article.quantity_purchased, v_article.total_cost_eur,
    'Creazione articolo', v_user, v_article.purchase_date::timestamptz
  );
  RETURN jsonb_build_object(
    'id', v_article.id,
    'article_code', v_article.article_code,
    'quantity_purchased', v_article.quantity_purchased,
    'total_cost_eur', v_article.total_cost_eur,
    'unit_cost_eur', v_article.unit_cost_eur,
    'article_type', v_article.article_type,
    'status', v_article.status
  );
END;
$function$;
