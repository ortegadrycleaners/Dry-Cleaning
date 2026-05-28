-- ============================================================================
-- SUPABASE COMPLETE MIGRATION
-- Contains all tables and functions for reminder system
-- Run this in Supabase SQL editor (service role)
-- ============================================================================

-- ============================================================================
-- TABLE 1: receipt_notification (for in-app notifications)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.receipt_notification (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_id uuid NOT NULL REFERENCES receipt(id_order) ON DELETE CASCADE,
  notification_type text NOT NULL,
  milestone int NULL,
  message text NOT NULL,
  phone text NULL,
  customer_name text NULL,
  order_number text NULL,
  idempotency_key text NULL,
  metadata jsonb NULL,
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_receipt_notification_idempotency_key ON public.receipt_notification (idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_receipt_notification_receipt_id ON public.receipt_notification (receipt_id);
CREATE INDEX IF NOT EXISTS idx_receipt_notification_created_at ON public.receipt_notification (created_at);

-- ============================================================================
-- TABLE 2: receipt_reminder_log (atomic tracking of sent reminders)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.receipt_reminder_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_id uuid NOT NULL REFERENCES receipt(id_order) ON DELETE CASCADE,
  milestone int NOT NULL CHECK (milestone IN (3,5,30)),
  sent_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (receipt_id, milestone)
);

CREATE INDEX IF NOT EXISTS idx_receipt_reminder_log_receipt_id ON public.receipt_reminder_log (receipt_id);
CREATE INDEX IF NOT EXISTS idx_receipt_reminder_log_sent_at ON public.receipt_reminder_log (sent_at);

-- ============================================================================
-- TABLE 3: receipt_reminder_task (pending tasks for admin UI modal)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.receipt_reminder_task (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_id uuid NOT NULL REFERENCES receipt(id_order) ON DELETE CASCADE,
  milestone int NOT NULL CHECK (milestone IN (3,5,30)),
  status text NOT NULL CHECK (status IN ('pending', 'sent', 'failed', 'skipped')) DEFAULT 'pending',
  order_number text NULL,
  customer_name text NULL,
  phone text NULL,
  message text NULL,
  attempted_at timestamptz NULL,
  sent_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_receipt_reminder_task_pending_unique ON public.receipt_reminder_task (receipt_id, milestone) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_receipt_reminder_task_receipt_id ON public.receipt_reminder_task (receipt_id);
CREATE INDEX IF NOT EXISTS idx_receipt_reminder_task_status ON public.receipt_reminder_task (status);
CREATE INDEX IF NOT EXISTS idx_receipt_reminder_task_created_at ON public.receipt_reminder_task (created_at);

-- ============================================================================
-- FUNCTION 1: create_order_atomic
-- Creates/validates client + creates receipt in one transaction
-- ============================================================================
CREATE OR REPLACE FUNCTION public.create_order_atomic(
  p_order_id uuid,
  p_public_id text,
  p_order_number integer,
  p_phone text,
  p_customer_name text,
  p_deliver_date timestamptz,
  p_status text,
  p_notes text DEFAULT NULL
)
RETURNS TABLE(order_id uuid, public_id text)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_client_id uuid;
  v_existing_name text;
BEGIN
  SELECT c.id_client, c.name
  INTO v_client_id, v_existing_name
  FROM public.client c
  WHERE c.phone_number = p_phone::numeric
  LIMIT 1;

  IF v_client_id IS NOT NULL THEN
    IF lower(trim(coalesce(v_existing_name, ''))) <> lower(trim(coalesce(p_customer_name, ''))) THEN
      RAISE EXCEPTION 'El número % ya está registrado con otro nombre.', p_phone
        USING ERRCODE = '22000';
    END IF;
  ELSE
    INSERT INTO public.client (id_client, phone_number, name)
    VALUES (gen_random_uuid(), p_phone::numeric, p_customer_name)
    RETURNING id_client INTO v_client_id;
  END IF;

  INSERT INTO public.receipt (
    id_order,
    public_id,
    order_number,
    order_date,
    deliver_date,
    fk_cliente,
    status,
    status_updated_at,
    notes
  ) VALUES (
    p_order_id,
    p_public_id,
    p_order_number,
    now(),
    p_deliver_date,
    v_client_id,
    p_status,
    now(),
    p_notes
  );

  RETURN QUERY SELECT p_order_id, p_public_id;
END;
$$;

-- ============================================================================
-- FUNCTION 2: claim_due_receipt_reminders
-- Atomically reserves reminders and returns only newly claimed ones
-- ============================================================================
CREATE OR REPLACE FUNCTION public.claim_due_receipt_reminders(p_tz text DEFAULT NULL)
RETURNS TABLE(receipt_id uuid, milestone int) AS $$
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
$$ LANGUAGE sql VOLATILE;

-- ============================================================================
-- FUNCTION 3: claim_and_notify_reminders
-- Single atomic call: detects due reminders, claims them, and creates notifications
-- ============================================================================
CREATE OR REPLACE FUNCTION public.claim_and_notify_reminders(p_tz text DEFAULT NULL)
RETURNS TABLE(notification_id uuid, receipt_id uuid, milestone int, notification_type text, created_at timestamptz) AS $$
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
$$ LANGUAGE sql VOLATILE;

-- ============================================================================
-- FUNCTION 3: detect_reminders_and_create_tasks
-- Detects orders at day 3/5/30 and creates pending tasks for admin modal
-- ============================================================================
CREATE OR REPLACE FUNCTION public.detect_reminders_and_create_tasks(p_tz text DEFAULT NULL)
RETURNS TABLE(task_id uuid, receipt_id uuid, milestone int) AS $$
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
$$ LANGUAGE sql VOLATILE;

-- ============================================================================
-- USAGE NOTES
-- ============================================================================
-- 1. Execute this entire script once in Supabase SQL editor
-- 
-- 2. For daily reminder detection:
--    SELECT * FROM public.detect_reminders_and_create_tasks('America/Puerto_Rico');
--
-- 3. Test data insertion and realtime subscriptions:
--    SELECT * FROM receipt_reminder_task WHERE status = 'pending';
--
-- 4. Frontend subscribes to realtime changes on receipt_reminder_task
--    and shows non-closeable modal with order details + SMS preview.
--
-- 5. Admin clicks "Enviar SMS" → frontend calls Edge Function → updates task.status = 'sent'
--    Or admin clicks "Omitir por ahora" → task.status = 'skipped'
--
-- 6. Table schema assumptions:
--    - receipt table: id_order, order_number, order_date, deliver_date, status, fk_cliente
--    - client table: id_client, name, phone_number
--    Both tables must exist and fk_cliente must be valid FK

-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Enable RLS on all reminder tables
ALTER TABLE public.receipt_notification ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receipt_reminder_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receipt_reminder_task ENABLE ROW LEVEL SECURITY;

-- receipt_notification: Everyone can read, service role can insert/update
CREATE POLICY "receipt_notification_select_all" ON public.receipt_notification
  FOR SELECT USING (true);

CREATE POLICY "receipt_notification_service_role_write" ON public.receipt_notification
  FOR INSERT WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "receipt_notification_update_all" ON public.receipt_notification
  FOR UPDATE USING (true) WITH CHECK (true);

-- receipt_reminder_log: Service role only (internal tracking)
CREATE POLICY "receipt_reminder_log_service_role" ON public.receipt_reminder_log
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- receipt_reminder_task: Everyone reads, but only update status (not pending creation)
CREATE POLICY "receipt_reminder_task_select_all" ON public.receipt_reminder_task
  FOR SELECT USING (true);

CREATE POLICY "receipt_reminder_task_service_role_insert" ON public.receipt_reminder_task
  FOR INSERT WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "receipt_reminder_task_anon_update_status" ON public.receipt_reminder_task
  FOR UPDATE USING (status = 'pending') 
  WITH CHECK (status IN ('sent', 'failed', 'skipped') AND status != 'pending');

-- ============================================================================
-- 7. Configure Row-Level Security (RLS):
--    ✅ Already configured above - all tables have RLS enabled with proper policies
