-- ShopATUT: arrotondamento dei valori numerici già presenti a massimo 2 decimali.
-- Eseguire solo dopo backup e revisione dello schema. Questo script NON viene eseguito automaticamente.
-- Comprende le colonne numeriche delle tabelle public; quantità intere restano invariate.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT table_schema, table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND data_type IN ('numeric', 'decimal', 'real', 'double precision')
      AND is_generated = 'NEVER'
  LOOP
    EXECUTE format(
      'UPDATE %I.%I SET %I = round(%I::numeric, 2) WHERE %I IS NOT NULL AND %I::numeric <> round(%I::numeric, 2)',
      r.table_schema, r.table_name, r.column_name, r.column_name, r.column_name, r.column_name, r.column_name
    );
  END LOOP;
END $$;
