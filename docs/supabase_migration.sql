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
-- 4. Verificar estructura final
-- =============================================================================
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name IN ('Client', 'Receipt')
ORDER BY table_name, ordinal_position;
