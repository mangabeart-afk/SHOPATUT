CREATE TABLE IF NOT EXISTS public.email_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient text NOT NULL,
  event_type text NOT NULL,
  entity_id uuid NULL,
  status text NOT NULL DEFAULT 'INVIATA',
  provider_message_id text NULL,
  error_message text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS email_notifications_event_created_idx ON public.email_notifications(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS email_notifications_recipient_idx ON public.email_notifications(recipient, created_at DESC);
ALTER TABLE public.email_notifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.email_notifications FROM PUBLIC, anon, authenticated;
CREATE POLICY email_notifications_admin_select ON public.email_notifications FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY email_notifications_admin_insert ON public.email_notifications FOR INSERT TO authenticated WITH CHECK (public.is_admin());
