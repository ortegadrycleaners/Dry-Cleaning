


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."claim_and_notify_reminders"("p_tz" "text" DEFAULT NULL::"text") RETURNS TABLE("notification_id" "uuid", "receipt_id" "uuid", "milestone" integer, "notification_type" "text", "created_at" timestamp with time zone)
    LANGUAGE "sql"
    AS $$
WITH due AS (
  SELECT r.id_order::uuid AS receipt_id,
         CASE
           WHEN ((CASE WHEN p_tz IS NULL THEN r.order_date ELSE (r.order_date AT TIME ZONE p_tz) END)::date) = (current_date - INTERVAL '3 days')::date THEN 3
           WHEN ((CASE WHEN p_tz IS NULL THEN r.order_date ELSE (r.order_date AT TIME ZONE p_tz) END)::date) = (current_date - INTERVAL '5 days')::date THEN 5
           WHEN ((CASE WHEN p_tz IS NULL THEN r.order_date ELSE (r.order_date AT TIME ZONE p_tz) END)::date) = (current_date - INTERVAL '30 days')::date THEN 30
         END AS milestone,
         COALESCE(r.order_number::text, '') AS order_number,
         COALESCE(c.name::text, '') AS customer_name,
         COALESCE(c.phone_number::text, '') AS phone
  FROM receipt r
  LEFT JOIN client c ON r.fk_cliente = c.id_client
  WHERE r.status = 'LISTO'
    AND (CASE WHEN p_tz IS NULL THEN r.order_date::date ELSE (r.order_date AT TIME ZONE p_tz)::date END) IN (
      (current_date - INTERVAL '3 days')::date,
      (current_date - INTERVAL '5 days')::date,
      (current_date - INTERVAL '30 days')::date
    )
),
claimed AS (
  INSERT INTO receipt_reminder_log (receipt_id, milestone, sent_at)
  SELECT receipt_id, milestone, now()
  FROM due
  ON CONFLICT (receipt_id, milestone) DO NOTHING
  RETURNING receipt_id, milestone
),
to_notify AS (
  SELECT d.receipt_id, d.milestone, d.order_number, d.customer_name, d.phone
  FROM due d
  JOIN claimed c ON c.receipt_id = d.receipt_id AND c.milestone = d.milestone
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


ALTER FUNCTION "public"."claim_and_notify_reminders"("p_tz" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."claim_due_receipt_reminders"("p_tz" "text" DEFAULT NULL::"text") RETURNS TABLE("receipt_id" "uuid", "milestone" integer)
    LANGUAGE "sql"
    AS $$
WITH due AS (
  SELECT r.id_order::uuid AS receipt_id,
         CASE
           WHEN ((CASE WHEN p_tz IS NULL THEN r.order_date ELSE (r.order_date AT TIME ZONE p_tz) END)::date) = (current_date - INTERVAL '3 days')::date THEN 3
           WHEN ((CASE WHEN p_tz IS NULL THEN r.order_date ELSE (r.order_date AT TIME ZONE p_tz) END)::date) = (current_date - INTERVAL '5 days')::date THEN 5
           WHEN ((CASE WHEN p_tz IS NULL THEN r.order_date ELSE (r.order_date AT TIME ZONE p_tz) END)::date) = (current_date - INTERVAL '30 days')::date THEN 30
         END AS milestone
  FROM receipt r
  WHERE r.status = 'LISTO'
    AND (CASE WHEN p_tz IS NULL THEN r.order_date::date ELSE (r.order_date AT TIME ZONE p_tz)::date END) IN (
      (current_date - INTERVAL '3 days')::date,
      (current_date - INTERVAL '5 days')::date,
      (current_date - INTERVAL '30 days')::date
    )
),
ins AS (
  INSERT INTO receipt_reminder_log (receipt_id, milestone, sent_at)
  SELECT receipt_id, milestone, now()
  FROM due
  ON CONFLICT (receipt_id, milestone) DO NOTHING
  RETURNING receipt_id, milestone
)
SELECT i.receipt_id, i.milestone
FROM ins i;
$$;


ALTER FUNCTION "public"."claim_due_receipt_reminders"("p_tz" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_order_atomic"("p_order_id" "uuid", "p_public_id" "text", "p_order_number" integer, "p_phone" "text", "p_customer_name" "text", "p_deliver_date" timestamp with time zone, "p_status" "text" DEFAULT 'RECIBIDO'::"text", "p_notes" "text" DEFAULT NULL::"text") RETURNS TABLE("order_id" "uuid", "public_id" "text")
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_client_id UUID;
  v_existing_client RECORD;
  v_now TIMESTAMPTZ := now();
  v_inserted_public_id TEXT;
BEGIN
  SELECT id_client, name
  INTO v_existing_client
  FROM client
  WHERE phone_number::text = p_phone
  LIMIT 1;

  IF FOUND THEN
    IF lower(trim(v_existing_client.name)) <> lower(trim(p_customer_name)) THEN
      RAISE EXCEPTION USING
        ERRCODE = '22000',
        MESSAGE = format(
          'No se pudo insertar la orden porque el número %s ya está registrado con %s.',
          p_phone,
          v_existing_client.name
        );
    END IF;

    v_client_id := v_existing_client.id_client;
  ELSE
    INSERT INTO client (
      id_client,
      phone_number,
      name
    ) VALUES (
      gen_random_uuid(),
      p_phone,
      p_customer_name
    )
    RETURNING id_client INTO v_client_id;
  END IF;

  BEGIN
    INSERT INTO receipt (
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
      v_now,
      p_deliver_date,
      v_client_id,
      p_status,
      v_now,
      p_notes
    )
    RETURNING id_order, receipt.public_id INTO order_id, v_inserted_public_id;
  EXCEPTION
    WHEN unique_violation THEN
      RAISE EXCEPTION USING
        ERRCODE = '23505',
        MESSAGE = format('El número de orden %s ya existe.', p_order_number);
  END;

  public_id := v_inserted_public_id;
  RETURN NEXT;
END;
$$;


ALTER FUNCTION "public"."create_order_atomic"("p_order_id" "uuid", "p_public_id" "text", "p_order_number" integer, "p_phone" "text", "p_customer_name" "text", "p_deliver_date" timestamp with time zone, "p_status" "text", "p_notes" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."detect_reminders_and_create_tasks"("p_tz" "text" DEFAULT NULL::"text") RETURNS TABLE("task_id" "uuid", "receipt_id" "uuid", "milestone" integer)
    LANGUAGE "sql"
    AS $$
WITH due AS (
  SELECT r.id_order::uuid AS receipt_id,
         CASE
           WHEN ((CASE WHEN p_tz IS NULL THEN r.order_date ELSE (r.order_date AT TIME ZONE p_tz) END)::date) = (current_date - INTERVAL '3 days')::date THEN 3
           WHEN ((CASE WHEN p_tz IS NULL THEN r.order_date ELSE (r.order_date AT TIME ZONE p_tz) END)::date) = (current_date - INTERVAL '5 days')::date THEN 5
           WHEN ((CASE WHEN p_tz IS NULL THEN r.order_date ELSE (r.order_date AT TIME ZONE p_tz) END)::date) = (current_date - INTERVAL '30 days')::date THEN 30
         END AS milestone,
         r.order_number::text,
         c.name::text as customer_name,
         c.phone_number::text as phone
  FROM receipt r
  LEFT JOIN client c ON r.fk_cliente = c.id_client
  WHERE r.status = 'LISTO'
    AND (CASE WHEN p_tz IS NULL THEN r.order_date::date ELSE (r.order_date AT TIME ZONE p_tz)::date END) IN (
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
  ON CONFLICT (receipt_id, milestone) WHERE status = 'pending' DO NOTHING
  RETURNING id, receipt_id, milestone
)
SELECT id, receipt_id, milestone FROM ins;
$$;


ALTER FUNCTION "public"."detect_reminders_and_create_tasks"("p_tz" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_rack_single_customer"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF NEW.rack_number IS NULL OR trim(NEW.rack_number) = '' THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM receipt
    WHERE trim(rack_number) = trim(NEW.rack_number)
      AND fk_cliente <> NEW.fk_cliente
      AND id_order <> NEW.id_order
  ) THEN
    RAISE EXCEPTION 'El rack % ya está asignado a otro cliente.', NEW.rack_number;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."enforce_rack_single_customer"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."client" (
    "id_client" "uuid" NOT NULL,
    "phone_number" "text" NOT NULL,
    "name" character varying(20)
);


ALTER TABLE "public"."client" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."receipt" (
    "id_order" "uuid" NOT NULL,
    "order_number" numeric(7,0) NOT NULL,
    "order_date" timestamp without time zone NOT NULL,
    "deliver_date" timestamp without time zone NOT NULL,
    "fk_cliente" "uuid" NOT NULL,
    "status" "text" DEFAULT 'RECIBIDO'::"text" NOT NULL,
    "rack_number" "text",
    "days_ready" integer,
    "notes" "text",
    "public_id" "text",
    "status_updated_at" timestamp with time zone,
    CONSTRAINT "receipt_status_check" CHECK (("status" = ANY (ARRAY['RECIBIDO'::"text", 'EN PROCESO'::"text", 'LISTO'::"text", 'ENTREGADO'::"text", 'ABANDONADO'::"text"])))
);


ALTER TABLE "public"."receipt" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."receipt_notification" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "receipt_id" "uuid" NOT NULL,
    "notification_type" "text" NOT NULL,
    "milestone" integer,
    "message" "text" NOT NULL,
    "phone" "text",
    "customer_name" "text",
    "order_number" "text",
    "idempotency_key" "text",
    "metadata" "jsonb",
    "read" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."receipt_notification" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."receipt_reminder_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "receipt_id" "uuid" NOT NULL,
    "milestone" integer NOT NULL,
    "sent_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "receipt_reminder_log_milestone_check" CHECK (("milestone" = ANY (ARRAY[3, 5, 30])))
);


ALTER TABLE "public"."receipt_reminder_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."receipt_reminder_task" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "receipt_id" "uuid" NOT NULL,
    "milestone" integer NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "order_number" "text",
    "customer_name" "text",
    "phone" "text",
    "message" "text",
    "attempted_at" timestamp with time zone,
    "sent_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "receipt_reminder_task_milestone_check" CHECK (("milestone" = ANY (ARRAY[3, 5, 30]))),
    CONSTRAINT "receipt_reminder_task_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'sent'::"text", 'failed'::"text", 'skipped'::"text"])))
);


ALTER TABLE "public"."receipt_reminder_task" OWNER TO "postgres";


ALTER TABLE ONLY "public"."client"
    ADD CONSTRAINT "client_pkey" PRIMARY KEY ("id_client");



ALTER TABLE ONLY "public"."receipt"
    ADD CONSTRAINT "pk_receipt" PRIMARY KEY ("fk_cliente", "id_order");



ALTER TABLE ONLY "public"."receipt"
    ADD CONSTRAINT "receipt_id_order_key" UNIQUE ("id_order");



ALTER TABLE ONLY "public"."receipt_notification"
    ADD CONSTRAINT "receipt_notification_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."receipt_reminder_log"
    ADD CONSTRAINT "receipt_reminder_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."receipt_reminder_log"
    ADD CONSTRAINT "receipt_reminder_log_receipt_id_milestone_key" UNIQUE ("receipt_id", "milestone");



ALTER TABLE ONLY "public"."receipt_reminder_task"
    ADD CONSTRAINT "receipt_reminder_task_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_client_phone" ON "public"."client" USING "btree" ("phone_number");



CREATE INDEX "idx_receipt_fk_cliente" ON "public"."receipt" USING "btree" ("fk_cliente");



CREATE INDEX "idx_receipt_notification_created_at" ON "public"."receipt_notification" USING "btree" ("created_at");



CREATE UNIQUE INDEX "idx_receipt_notification_idempotency_key" ON "public"."receipt_notification" USING "btree" ("idempotency_key") WHERE ("idempotency_key" IS NOT NULL);



CREATE INDEX "idx_receipt_notification_receipt_id" ON "public"."receipt_notification" USING "btree" ("receipt_id");



CREATE INDEX "idx_receipt_order_date" ON "public"."receipt" USING "btree" ("order_date" DESC);



CREATE UNIQUE INDEX "idx_receipt_public_id" ON "public"."receipt" USING "btree" ("public_id") WHERE ("public_id" IS NOT NULL);



CREATE INDEX "idx_receipt_reminder_log_receipt_id" ON "public"."receipt_reminder_log" USING "btree" ("receipt_id");



CREATE INDEX "idx_receipt_reminder_log_sent_at" ON "public"."receipt_reminder_log" USING "btree" ("sent_at");



CREATE INDEX "idx_receipt_reminder_task_created_at" ON "public"."receipt_reminder_task" USING "btree" ("created_at");



CREATE UNIQUE INDEX "idx_receipt_reminder_task_pending_unique" ON "public"."receipt_reminder_task" USING "btree" ("receipt_id", "milestone") WHERE ("status" = 'pending'::"text");



CREATE INDEX "idx_receipt_reminder_task_receipt_id" ON "public"."receipt_reminder_task" USING "btree" ("receipt_id");



CREATE INDEX "idx_receipt_reminder_task_status" ON "public"."receipt_reminder_task" USING "btree" ("status");



CREATE OR REPLACE TRIGGER "receipt_rack_single_customer" BEFORE INSERT OR UPDATE ON "public"."receipt" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_rack_single_customer"();



ALTER TABLE ONLY "public"."receipt"
    ADD CONSTRAINT "fk_receipt_cliente" FOREIGN KEY ("fk_cliente") REFERENCES "public"."client"("id_client");



ALTER TABLE ONLY "public"."receipt_notification"
    ADD CONSTRAINT "receipt_notification_receipt_id_fkey" FOREIGN KEY ("receipt_id") REFERENCES "public"."receipt"("id_order") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."receipt_reminder_log"
    ADD CONSTRAINT "receipt_reminder_log_receipt_id_fkey" FOREIGN KEY ("receipt_id") REFERENCES "public"."receipt"("id_order") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."receipt_reminder_task"
    ADD CONSTRAINT "receipt_reminder_task_receipt_id_fkey" FOREIGN KEY ("receipt_id") REFERENCES "public"."receipt"("id_order") ON DELETE CASCADE;



ALTER TABLE "public"."client" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "client_insert_public" ON "public"."client" FOR INSERT WITH CHECK (true);



CREATE POLICY "client_search_by_phone" ON "public"."client" FOR SELECT USING (true);



ALTER TABLE "public"."receipt" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "receipt_insert_authenticated_only" ON "public"."receipt" FOR INSERT WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



ALTER TABLE "public"."receipt_notification" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "receipt_public_tracking_only" ON "public"."receipt" FOR SELECT USING (((("public_id" IS NOT NULL) AND ("auth"."role"() = 'anon'::"text")) OR ("auth"."role"() = 'authenticated'::"text")));



ALTER TABLE "public"."receipt_reminder_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."receipt_reminder_task" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "receipt_update_authenticated_only" ON "public"."receipt" FOR UPDATE USING (("auth"."role"() = 'authenticated'::"text")) WITH CHECK (("auth"."role"() = 'authenticated'::"text"));





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";






















































































































































GRANT ALL ON FUNCTION "public"."claim_and_notify_reminders"("p_tz" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."claim_and_notify_reminders"("p_tz" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."claim_and_notify_reminders"("p_tz" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."claim_due_receipt_reminders"("p_tz" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."claim_due_receipt_reminders"("p_tz" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."claim_due_receipt_reminders"("p_tz" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_order_atomic"("p_order_id" "uuid", "p_public_id" "text", "p_order_number" integer, "p_phone" "text", "p_customer_name" "text", "p_deliver_date" timestamp with time zone, "p_status" "text", "p_notes" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."create_order_atomic"("p_order_id" "uuid", "p_public_id" "text", "p_order_number" integer, "p_phone" "text", "p_customer_name" "text", "p_deliver_date" timestamp with time zone, "p_status" "text", "p_notes" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_order_atomic"("p_order_id" "uuid", "p_public_id" "text", "p_order_number" integer, "p_phone" "text", "p_customer_name" "text", "p_deliver_date" timestamp with time zone, "p_status" "text", "p_notes" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."detect_reminders_and_create_tasks"("p_tz" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."detect_reminders_and_create_tasks"("p_tz" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."detect_reminders_and_create_tasks"("p_tz" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."enforce_rack_single_customer"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_rack_single_customer"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_rack_single_customer"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "anon";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "service_role";


















GRANT ALL ON TABLE "public"."client" TO "anon";
GRANT ALL ON TABLE "public"."client" TO "authenticated";
GRANT ALL ON TABLE "public"."client" TO "service_role";



GRANT ALL ON TABLE "public"."receipt" TO "anon";
GRANT ALL ON TABLE "public"."receipt" TO "authenticated";
GRANT ALL ON TABLE "public"."receipt" TO "service_role";



GRANT ALL ON TABLE "public"."receipt_notification" TO "anon";
GRANT ALL ON TABLE "public"."receipt_notification" TO "authenticated";
GRANT ALL ON TABLE "public"."receipt_notification" TO "service_role";



GRANT ALL ON TABLE "public"."receipt_reminder_log" TO "anon";
GRANT ALL ON TABLE "public"."receipt_reminder_log" TO "authenticated";
GRANT ALL ON TABLE "public"."receipt_reminder_log" TO "service_role";



GRANT ALL ON TABLE "public"."receipt_reminder_task" TO "anon";
GRANT ALL ON TABLE "public"."receipt_reminder_task" TO "authenticated";
GRANT ALL ON TABLE "public"."receipt_reminder_task" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";



































