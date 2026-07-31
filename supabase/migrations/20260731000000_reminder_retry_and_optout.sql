-- Fixes two backend gaps found while diagnosing Twilio delivery failures
-- (docs/TWILIO_DIAGNOSTICS.md):
--
-- 1. `claim_and_notify_reminders` claimed a reminder (INSERT INTO
--    receipt_notification) *before* the Edge Function attempted the Twilio
--    send, with no way to retry on failure (guard block, 21704, 30034,
--    network error, ...). A failed automated reminder was lost forever.
--    Fix: add status/error tracking to receipt_notification and let the RPC
--    re-claim rows that previously failed (or got stuck mid-flight).
--
-- 2. No STOP/START opt-out handling existed anywhere in the backend.
--    Fix: add a phone-keyed suppression table checked by a new guard
--    (checkOptOut in _shared/guards.ts) and populated by the new
--    twilio-inbound-sms Edge Function.

-- ==========================================================================
-- 1. receipt_notification: status tracking + retry-safe claim
-- ==========================================================================
ALTER TABLE public.receipt_notification
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'sent',
  ADD COLUMN IF NOT EXISTS message_sid text NULL,
  ADD COLUMN IF NOT EXISTS error_code text NULL,
  ADD COLUMN IF NOT EXISTS error_message text NULL,
  ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS sent_at timestamptz NULL;

-- Historical rows predate status tracking; they were sent under the old
-- "claim = success" assumption, so mark them as sent instead of making them
-- eligible for an automatic resend.
UPDATE public.receipt_notification
SET sent_at = created_at
WHERE sent_at IS NULL AND status = 'sent';

ALTER TABLE public.receipt_notification
  DROP CONSTRAINT IF EXISTS receipt_notification_status_check;
ALTER TABLE public.receipt_notification
  ADD CONSTRAINT receipt_notification_status_check
  CHECK (status IN ('claimed', 'sent', 'failed'));

-- New rows are "claimed" (attempt in progress) until the Edge Function
-- confirms success or failure.
ALTER TABLE public.receipt_notification ALTER COLUMN status SET DEFAULT 'claimed';

CREATE INDEX IF NOT EXISTS idx_receipt_notification_status
  ON public.receipt_notification (status);

CREATE OR REPLACE FUNCTION public.claim_and_notify_reminders(p_tz text DEFAULT NULL::text)
RETURNS TABLE(
  notification_id uuid,
  receipt_id uuid,
  milestone integer,
  notification_type text,
  created_at timestamptz
)
LANGUAGE sql
AS $$
WITH ready_at AS (
  SELECT
    r.id_order::uuid AS receipt_id,
    (CASE
      WHEN p_tz IS NULL THEN COALESCE(r.status_updated_at, r.order_date)
      ELSE (COALESCE(r.status_updated_at, r.order_date) AT TIME ZONE p_tz)
    END)::date AS ready_date,
    COALESCE(r.order_number::text, '') AS order_number,
    COALESCE(c.name::text, '') AS customer_name,
    COALESCE(c.phone_number::text, '') AS phone
  FROM receipt r
  LEFT JOIN client c ON r.fk_cliente = c.id_client
  WHERE r.status = 'LISTO'
    AND COALESCE(r.status_updated_at, r.order_date) IS NOT NULL
),
due AS (
  SELECT
    ra.receipt_id,
    CASE
      WHEN ra.ready_date = (current_date - INTERVAL '3 days')::date THEN 3
      WHEN ra.ready_date = (current_date - INTERVAL '5 days')::date THEN 5
      WHEN ra.ready_date = (current_date - INTERVAL '30 days')::date THEN 30
    END AS milestone,
    ra.order_number,
    ra.customer_name,
    ra.phone
  FROM ready_at ra
  WHERE ra.ready_date IN (
    (current_date - INTERVAL '3 days')::date,
    (current_date - INTERVAL '5 days')::date,
    (current_date - INTERVAL '30 days')::date
  )
),
to_notify AS (
  SELECT d.receipt_id, d.milestone, d.order_number, d.customer_name, d.phone
  FROM due d
  WHERE d.milestone IS NOT NULL
),
ins_notify AS (
  INSERT INTO receipt_notification (
    receipt_id,
    notification_type,
    milestone,
    message,
    phone,
    customer_name,
    order_number,
    idempotency_key,
    metadata,
    status,
    attempts,
    claimed_at,
    created_at
  )
  SELECT
    t.receipt_id,
    CASE t.milestone WHEN 3 THEN 'PICKUP_REMINDER' WHEN 5 THEN 'URGENT_REMINDER' ELSE 'DAY_30_REMINDER' END,
    t.milestone,
    format('Recordatorio: %s, tu orden #%s lleva %s días lista. Visita la tienda para recogerla.', t.customer_name, t.order_number, t.milestone),
    NULLIF(t.phone, '')::text,
    NULLIF(t.customer_name, '')::text,
    NULLIF(t.order_number, '')::text,
    (t.receipt_id::text || ':' || t.milestone::text),
    jsonb_build_object('claimed_at', now(), 'milestone', t.milestone),
    'claimed',
    1,
    now(),
    now()
  FROM to_notify t
  -- Re-claim (retry) a row only if the previous attempt failed outright, or
  -- got stuck "claimed" for >30min (Edge Function crashed/timed out mid-send).
  -- Rows already 'sent', or 'claimed' recently by an in-flight run, are left
  -- untouched and therefore NOT returned below.
  ON CONFLICT (idempotency_key) DO UPDATE
    SET status = 'claimed',
        attempts = receipt_notification.attempts + 1,
        claimed_at = now(),
        error_code = NULL,
        error_message = NULL
    WHERE receipt_notification.attempts < 5
      AND (
        receipt_notification.status = 'failed'
        OR (receipt_notification.status = 'claimed' AND receipt_notification.claimed_at < now() - INTERVAL '30 minutes')
      )
  RETURNING id, receipt_id, milestone, notification_type, created_at
)
SELECT id, receipt_id, milestone, notification_type, created_at FROM ins_notify;
$$;

-- ==========================================================================
-- 2. SMS opt-out (STOP/START) suppression list
-- ==========================================================================
CREATE TABLE IF NOT EXISTS public.sms_opt_out (
  phone_e164 text PRIMARY KEY,
  opted_out_at timestamptz NOT NULL DEFAULT now(),
  last_keyword text,
  source text NOT NULL DEFAULT 'inbound_sms'
);

ALTER TABLE public.sms_opt_out ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sms_opt_out_service_role ON public.sms_opt_out;
CREATE POLICY sms_opt_out_service_role
  ON public.sms_opt_out
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
