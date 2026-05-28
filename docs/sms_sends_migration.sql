-- SMS send idempotency and server-side rate-limit accounting
-- Run in Supabase SQL Editor after supabase_migration.sql

CREATE TABLE IF NOT EXISTS public.sms_sends (
  idempotency_key text PRIMARY KEY,
  order_id uuid NOT NULL,
  template_type text NOT NULL,
  operator_id uuid NULL,
  message_sid text NULL,
  phone text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sms_sends_order_id ON public.sms_sends (order_id);
CREATE INDEX IF NOT EXISTS idx_sms_sends_created_at ON public.sms_sends (created_at);

ALTER TABLE public.sms_sends ENABLE ROW LEVEL SECURITY;

-- Only service role (Edge Functions) can read/write
CREATE POLICY "sms_sends_service_role" ON public.sms_sends
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
