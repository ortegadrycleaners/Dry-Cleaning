-- Enables the frontend to reconcile the real Twilio delivery outcome
-- (delivered/undelivered/failed, set by twilio-status-callback) with the
-- notifications shown in the dashboard, instead of trusting the initial
-- "Twilio accepted the request" response as final status.

-- sms_sends only had a service_role policy; the dashboard client (authenticated
-- role) couldn't read it at all, so it had no way to pick up the real status.
DROP POLICY IF EXISTS sms_sends_select_authenticated ON public.sms_sends;
CREATE POLICY sms_sends_select_authenticated
  ON public.sms_sends
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- Required for the frontend realtime subscription (postgres_changes) to
-- receive UPDATE events on this table.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'sms_sends'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.sms_sends;
  END IF;
END $$;
