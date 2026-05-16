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
ALTER TABLE "Client"  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Receipt" ENABLE ROW LEVEL SECURITY;

-- Client: lectura pública (para autocompletar teléfono) e inserción
CREATE POLICY IF NOT EXISTS "client_public_select"
  ON "Client" FOR SELECT USING (true);

CREATE POLICY IF NOT EXISTS "client_public_insert"
  ON "Client" FOR INSERT WITH CHECK (true);

-- Receipt: lectura pública (para tracking de cliente) + inserción + actualización
CREATE POLICY IF NOT EXISTS "receipt_public_select"
  ON "Receipt" FOR SELECT USING (true);

CREATE POLICY IF NOT EXISTS "receipt_public_insert"
  ON "Receipt" FOR INSERT WITH CHECK (true);

CREATE POLICY IF NOT EXISTS "receipt_public_update"
  ON "Receipt" FOR UPDATE USING (true) WITH CHECK (true);


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
