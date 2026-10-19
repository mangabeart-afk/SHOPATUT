-- Consente di distinguere un articolo assegnato al cliente e fisicamente presente nella sua casella.
-- Coerente con la convenzione Excel: cella STOCK gialla => IN_BOX.
ALTER TABLE public.article_assignments
  DROP CONSTRAINT IF EXISTS article_assignments_status_check;

ALTER TABLE public.article_assignments
  ADD CONSTRAINT article_assignments_status_check
  CHECK (status = ANY (ARRAY['ATTIVA'::text, 'IN_BOX'::text, 'ANNULLATA'::text]));
