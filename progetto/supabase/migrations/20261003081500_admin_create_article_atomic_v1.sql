-- SHOPATUT 03/10/2026
-- Creazione articolo + movimento iniziale in un'unica transazione DB.

CREATE OR REPLACE FUNCTION public.admin_create_article(p_article jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_article public.articles%ROWTYPE;
  v_user uuid;
  v_quantity integer;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Operazione non autorizzata';
  END IF;

  v_user := auth.uid();
  v_quantity := COALESCE((p_article->>'quantity_purchased')::integer, 0);

  IF v_quantity <= 0 THEN
    RAISE EXCEPTION 'La quantità deve essere maggiore di zero';
  END IF;

  INSERT INTO public.articles(
    purchase_date, origin, article_type, seller, series, detail,
    quantity_purchased, currency, unit_price_foreign, exchange_rate,
    accessory_cost_eur,
    commission_type, commission_cost, commission_percent, commission_currency, commission_exchange_rate,
    customs_type, customs_cost, customs_percent, customs_currency, customs_exchange_rate,
    shipping_type, shipping_cost, shipping_percent, shipping_currency, shipping_exchange_rate,
    notes, status
  )
  VALUES (
    COALESCE(NULLIF(p_article->>'purchase_date','')::date, CURRENT_DATE),
    COALESCE(NULLIF(p_article->>'origin',''),'GIAPPONE'),
    COALESCE(NULLIF(p_article->>'article_type',''),'ALTRO'),
    NULLIF(p_article->>'seller',''),
    NULLIF(p_article->>'series',''),
    NULLIF(p_article->>'detail',''),
    v_quantity,
    COALESCE(NULLIF(p_article->>'currency',''),'EUR'),
    COALESCE((p_article->>'unit_price_foreign')::numeric,0),
    COALESCE((p_article->>'exchange_rate')::numeric,1),
    0,
    COALESCE(NULLIF(p_article->>'commission_type',''),'FIXED'),
    COALESCE((p_article->>'commission_cost')::numeric,0),
    COALESCE((p_article->>'commission_percent')::numeric,0),
    COALESCE(NULLIF(p_article->>'commission_currency',''),'EUR'),
    COALESCE((p_article->>'commission_exchange_rate')::numeric,1),
    COALESCE(NULLIF(p_article->>'customs_type',''),'PERCENT'),
    COALESCE((p_article->>'customs_cost')::numeric,0),
    COALESCE((p_article->>'customs_percent')::numeric,0),
    COALESCE(NULLIF(p_article->>'customs_currency',''),'EUR'),
    COALESCE((p_article->>'customs_exchange_rate')::numeric,1),
    COALESCE(NULLIF(p_article->>'shipping_type',''),'FIXED'),
    COALESCE((p_article->>'shipping_cost')::numeric,0),
    COALESCE((p_article->>'shipping_percent')::numeric,0),
    COALESCE(NULLIF(p_article->>'shipping_currency',''),'EUR'),
    COALESCE((p_article->>'shipping_exchange_rate')::numeric,1),
    NULLIF(p_article->>'notes',''),
    COALESCE(NULLIF(p_article->>'status',''),'IN_ARRIVO')
  )
  RETURNING * INTO v_article;

  INSERT INTO public.movements(
    mailbox_id, movement_type, reference_id, reference_code, article_id,
    quantity, total_amount_eur, description, operator_user_id, movement_at
  )
  VALUES(
    NULL, 'ARTICOLO', v_article.id, v_article.article_code, v_article.id,
    v_article.quantity_purchased, v_article.total_cost_eur, 'Creazione', v_user,
    v_article.purchase_date::timestamptz
  );

  RETURN jsonb_build_object(
    'id', v_article.id,
    'article_code', v_article.article_code,
    'quantity_purchased', v_article.quantity_purchased,
    'total_cost_eur', v_article.total_cost_eur,
    'status', v_article.status
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_create_article(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_create_article(jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';
