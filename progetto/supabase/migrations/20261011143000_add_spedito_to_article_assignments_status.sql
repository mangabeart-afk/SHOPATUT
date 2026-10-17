ALTER TABLE public.article_assignments
  DROP CONSTRAINT IF EXISTS article_assignments_status_check;

ALTER TABLE public.article_assignments
  ADD CONSTRAINT article_assignments_status_check
  CHECK (status = ANY (ARRAY['ATTIVA'::text, 'IN_BOX'::text, 'SPEDITO'::text, 'ANNULLATA'::text]));
