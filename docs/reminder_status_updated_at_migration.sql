-- Reminder milestones based on status_updated_at (when order became LISTO)
-- Replaces order_date in claim/detect functions. Run after supabase_migration.sql.

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

CREATE OR REPLACE FUNCTION public.claim_and_notify_reminders(p_tz text DEFAULT NULL)
RETURNS TABLE(
  notification_id uuid,
  receipt_id uuid,
  milestone int,
  notification_type text,
  created_at timestamptz
) AS $$
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
