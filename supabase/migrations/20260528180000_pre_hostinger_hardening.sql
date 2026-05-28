-- Pre-Hostinger hardening and versioned Supabase changes.
--
-- This script is idempotent and can be pasted into the Supabase SQL editor.
-- It versions the pieces that are currently only documented or exported in the
-- remote schema dump:
--   - sms_sends idempotency table
--   - reminder table policies
--   - reminder functions based on status_updated_at
--   - current client/receipt policies used by the app

-- ==========================================================================
-- SMS SENDS
-- ==========================================================================
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

DROP POLICY IF EXISTS sms_sends_service_role ON public.sms_sends;
CREATE POLICY sms_sends_service_role
  ON public.sms_sends
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ==========================================================================
-- CLIENT
-- ==========================================================================
ALTER TABLE public.client ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS client_insert_public ON public.client;
CREATE POLICY client_insert_public
  ON public.client
  FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS client_search_by_phone ON public.client;
CREATE POLICY client_search_by_phone
  ON public.client
  FOR SELECT
  USING (true);

-- ==========================================================================
-- RECEIPT
-- ==========================================================================
ALTER TABLE public.receipt ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS receipt_insert_authenticated_only ON public.receipt;
CREATE POLICY receipt_insert_authenticated_only
  ON public.receipt
  FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS receipt_public_tracking_only ON public.receipt;
CREATE POLICY receipt_public_tracking_only
  ON public.receipt
  FOR SELECT
  USING (
    (public_id IS NOT NULL AND auth.role() = 'anon')
    OR auth.role() = 'authenticated'
  );

DROP POLICY IF EXISTS receipt_update_authenticated_only ON public.receipt;
CREATE POLICY receipt_update_authenticated_only
  ON public.receipt
  FOR UPDATE
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- ==========================================================================
-- RECEIPT NOTIFICATIONS
-- ==========================================================================
ALTER TABLE public.receipt_notification ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS receipt_notification_select_authenticated ON public.receipt_notification;
CREATE POLICY receipt_notification_select_authenticated
  ON public.receipt_notification
  FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS receipt_notification_service_role_write ON public.receipt_notification;
CREATE POLICY receipt_notification_service_role_write
  ON public.receipt_notification
  FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

-- ==========================================================================
-- RECEIPT REMINDER LOG
-- ==========================================================================
ALTER TABLE public.receipt_reminder_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS receipt_reminder_log_service_role ON public.receipt_reminder_log;
CREATE POLICY receipt_reminder_log_service_role
  ON public.receipt_reminder_log
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ==========================================================================
-- RECEIPT REMINDER TASKS
-- ==========================================================================
ALTER TABLE public.receipt_reminder_task ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS receipt_reminder_task_select_authenticated ON public.receipt_reminder_task;
CREATE POLICY receipt_reminder_task_select_authenticated
  ON public.receipt_reminder_task
  FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS receipt_reminder_task_service_role_insert ON public.receipt_reminder_task;
CREATE POLICY receipt_reminder_task_service_role_insert
  ON public.receipt_reminder_task
  FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS receipt_reminder_task_authenticated_skip ON public.receipt_reminder_task;
CREATE POLICY receipt_reminder_task_authenticated_skip
  ON public.receipt_reminder_task
  FOR UPDATE
  USING (auth.role() = 'authenticated' AND status = 'pending')
  WITH CHECK (status = 'skipped');

-- ==========================================================================
-- REMINDER FUNCTIONS (status_updated_at based)
-- ==========================================================================
CREATE OR REPLACE FUNCTION public.claim_due_receipt_reminders(p_tz text DEFAULT NULL::text)
RETURNS TABLE(receipt_id uuid, milestone integer)
LANGUAGE sql
AS $$
WITH ready_at AS (
  SELECT
    r.id_order::uuid AS receipt_id,
    (CASE
      WHEN p_tz IS NULL THEN COALESCE(r.status_updated_at, r.order_date)
      ELSE (COALESCE(r.status_updated_at, r.order_date) AT TIME ZONE p_tz)
    END)::date AS ready_date
  FROM receipt r
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
    END AS milestone
  FROM ready_at ra
  WHERE ra.ready_date IN (
    (current_date - INTERVAL '3 days')::date,
    (current_date - INTERVAL '5 days')::date,
    (current_date - INTERVAL '30 days')::date
  )
),
ins AS (
  INSERT INTO receipt_reminder_log (receipt_id, milestone, sent_at)
  SELECT receipt_id, milestone, now()
  FROM due
  WHERE milestone IS NOT NULL
  ON CONFLICT (receipt_id, milestone) DO NOTHING
  RETURNING receipt_id, milestone
)
SELECT i.receipt_id, i.milestone FROM ins i;
$$;

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
claimed AS (
  INSERT INTO receipt_reminder_log (receipt_id, milestone, sent_at)
  SELECT receipt_id, milestone, now()
  FROM due
  WHERE milestone IS NOT NULL
  ON CONFLICT (receipt_id, milestone) DO NOTHING
  RETURNING receipt_id, milestone
),
to_notify AS (
  SELECT d.receipt_id, d.milestone, d.order_number, d.customer_name, d.phone
  FROM due d
  JOIN claimed c ON c.receipt_id = d.receipt_id AND c.milestone = d.milestone
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
    now()
  FROM to_notify t
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING id, receipt_id, milestone, notification_type, created_at
)
SELECT id, receipt_id, milestone, notification_type, created_at FROM ins_notify;
$$;

CREATE OR REPLACE FUNCTION public.detect_reminders_and_create_tasks(p_tz text DEFAULT NULL::text)
RETURNS TABLE(task_id uuid, receipt_id uuid, milestone integer)
LANGUAGE sql
AS $$
WITH ready_at AS (
  SELECT
    r.id_order::uuid AS receipt_id,
    (CASE
      WHEN p_tz IS NULL THEN COALESCE(r.status_updated_at, r.order_date)
      ELSE (COALESCE(r.status_updated_at, r.order_date) AT TIME ZONE p_tz)
    END)::date AS ready_date,
    r.order_number::text,
    c.name::text AS customer_name,
    c.phone_number::text AS phone
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
ins AS (
  INSERT INTO receipt_reminder_task (receipt_id, milestone, order_number, customer_name, phone, message, status)
  SELECT
    d.receipt_id,
    d.milestone,
    d.order_number,
    d.customer_name,
    d.phone,
    format('Recordatorio: %s, tu orden #%s lleva %s días lista. Recógela pronto.', d.customer_name, d.order_number, d.milestone),
    'pending'
  FROM due d
  WHERE d.milestone IS NOT NULL
  ON CONFLICT (receipt_id, milestone) WHERE status = 'pending' DO NOTHING
  RETURNING id, receipt_id, milestone
)
SELECT id, receipt_id, milestone FROM ins;
$$;
