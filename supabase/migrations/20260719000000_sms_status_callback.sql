-- Twilio delivery-status tracking for sms_sends, used by the
-- twilio-status-callback Edge Function webhook.

ALTER TABLE public.sms_sends
  ADD COLUMN IF NOT EXISTS status text NULL,
  ADD COLUMN IF NOT EXISTS error_code text NULL,
  ADD COLUMN IF NOT EXISTS error_message text NULL,
  ADD COLUMN IF NOT EXISTS status_updated_at timestamptz NULL;

CREATE INDEX IF NOT EXISTS idx_sms_sends_message_sid ON public.sms_sends (message_sid);
