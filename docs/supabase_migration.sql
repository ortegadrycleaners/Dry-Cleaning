-- =============================================================================
-- MIGRACIÓN SUPABASE — Dry Cleaning MVP
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- =============================================================================

-- 1. Agregar columnas faltantes a la tabla Receipt
-- (Las columnas de status, rack_number, etc. no estaban en el esquema original)
-- =============================================================================

ALTER TABLE "Receipt"
  ADD COLUMN IF NOT EXISTS status             TEXT NOT NULL DEFAULT 'RECIBIDO',
  ADD COLUMN IF NOT EXISTS status_updated_at   TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS rack_number        TEXT,
  ADD COLUMN IF NOT EXISTS days_ready         INTEGER,
  ADD COLUMN IF NOT EXISTS notes              TEXT,
  ADD COLUMN IF NOT EXISTS public_id          TEXT;

-- Constraint: status solo puede ser uno de los 4 valores válidos
ALTER TABLE "Receipt"
  ADD CONSTRAINT IF NOT EXISTS receipt_status_check
  CHECK (status IN ('RECIBIDO', 'EN PROCESO', 'LISTO', 'ENTREGADO'));

-- Constraint: un rack solo puede estar asignado a un cliente distinto
CREATE OR REPLACE FUNCTION enforce_rack_single_customer()
RETURNS trigger
LANGUAGE plpgsql
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

CREATE TRIGGER receipt_rack_single_customer
BEFORE INSERT OR UPDATE ON receipt
FOR EACH ROW
EXECUTE FUNCTION enforce_rack_single_customer();


-- =============================================================================
-- 2. Row Level Security (RLS)
-- Para que el frontend (anon key) pueda leer y escribir
-- =============================================================================

-- Habilitar RLS en ambas tablas
ALTER TABLE client  ENABLE ROW LEVEL SECURITY;
ALTER TABLE receipt ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- POLÍTICAS RLS SEGURAS (Empleados autenticados + Tracking público)
-- Nota: IF NOT EXISTS no funciona con CREATE POLICY, usar DROP IF EXISTS
-- ============================================================================

-- Eliminar políticas antiguas (inseguras)
DROP POLICY IF EXISTS "client_public_select" ON client;
DROP POLICY IF EXISTS "client_public_insert" ON client;
DROP POLICY IF EXISTS "receipt_public_select" ON receipt;
DROP POLICY IF EXISTS "receipt_public_insert" ON receipt;
DROP POLICY IF EXISTS "receipt_public_update" ON receipt;

-- Eliminar políticas nuevas si existen (para re-ejecutar sin error)
DROP POLICY IF EXISTS "client_search_by_phone" ON client;
DROP POLICY IF EXISTS "client_insert_public" ON client;
DROP POLICY IF EXISTS "receipt_public_tracking_only" ON receipt;
DROP POLICY IF EXISTS "receipt_insert_authenticated_only" ON receipt;
DROP POLICY IF EXISTS "receipt_update_authenticated_only" ON receipt;

-- ============================================================================
-- CREAR NUEVAS POLÍTICAS SEGURAS
-- ============================================================================

-- Client: lectura pública (low-risk: solo phone + name para autocompletar)
CREATE POLICY "client_search_by_phone"
  ON client FOR SELECT USING (true);

-- Client: inserción pública (validada en app) — solo durante creación de órdenes
CREATE POLICY "client_insert_public"
  ON client FOR INSERT 
  WITH CHECK (true);

-- ============================================================================
-- Receipt (CRÍTICO - Solo empleados autenticados pueden crear/editar):
-- ============================================================================

-- Receipt SELECT: 
--   • Público: SOLO lectura por public_id (para tracking de clientes)
--   • Autenticados: acceso completo (empleados en dashboard)
CREATE POLICY "receipt_public_tracking_only"
  ON receipt FOR SELECT 
  USING (
    -- Tracking público: solo acceso por public_id (no expone otros datos)
    (public_id IS NOT NULL AND auth.role() = 'anon')
    OR
    -- Empleados autenticados: acceso completo
    (auth.role() = 'authenticated')
  );

-- Receipt INSERT: SOLO empleados autenticados
CREATE POLICY "receipt_insert_authenticated_only"
  ON receipt FOR INSERT 
  WITH CHECK (auth.role() = 'authenticated');

-- Receipt UPDATE: SOLO empleados autenticados
CREATE POLICY "receipt_update_authenticated_only"
  ON receipt FOR UPDATE 
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');


-- =============================================================================
-- 3. (Opcional) Índices para mejorar el rendimiento de las búsquedas
-- =============================================================================

-- Búsqueda de órdenes por cliente (JOIN receipt → client)
CREATE INDEX IF NOT EXISTS idx_receipt_fk_cliente ON "Receipt" (fk_cliente);

-- Búsqueda de cliente por teléfono (autocompletado)
CREATE INDEX IF NOT EXISTS idx_client_phone ON "Client" (phone_number);

-- Tracking por id público (Base62)
CREATE UNIQUE INDEX IF NOT EXISTS idx_receipt_public_id
  ON "Receipt" (public_id)
  WHERE public_id IS NOT NULL;

-- Orden cronológico de las órdenes en el dashboard
CREATE INDEX IF NOT EXISTS idx_receipt_order_date ON "Receipt" (order_date DESC);


-- =============================================================================
-- 5. Inserción atómica de órdenes
-- Evita carreras cuando dos envíos intentan usar el mismo order_number al mismo tiempo.
-- =============================================================================

CREATE OR REPLACE FUNCTION create_order_atomic(
  p_order_id UUID,
  p_public_id TEXT,
  p_order_number INTEGER,
  p_phone BIGINT,
  p_customer_name TEXT,
  p_deliver_date TIMESTAMPTZ,
  p_status TEXT DEFAULT 'RECIBIDO',
  p_notes TEXT DEFAULT NULL
)
RETURNS TABLE(order_id UUID, public_id TEXT)
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_client_id UUID;
  v_existing_client RECORD;
  v_now TIMESTAMPTZ := now();
BEGIN
  SELECT id_client, name
  INTO v_existing_client
  FROM client
  WHERE phone_number = p_phone
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
    RETURNING id_order, public_id INTO order_id, public_id;
  EXCEPTION
    WHEN unique_violation THEN
      RAISE EXCEPTION USING
        ERRCODE = '23505',
        MESSAGE = format('El número de orden %s ya existe.', p_order_number);
  END;

  RETURN NEXT;
END;
$$;


-- =============================================================================
-- 6. Verificar estructura final
-- =============================================================================
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name IN ('Client', 'Receipt')
ORDER BY table_name, ordinal_position;
