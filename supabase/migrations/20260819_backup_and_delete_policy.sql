-- Migración SQL: Backup de seguridad y política de eliminación para la tabla receipt
-- Fecha: 2026-08-19

-- 1. Copia de respaldo (Backup) de la tabla receipt actual en producción
CREATE TABLE IF NOT EXISTS public.receipt_backup_20260819 AS 
SELECT * FROM public.receipt;

-- 2. Habilitar la política RLS para permitir la eliminación física (DELETE) en la tabla receipt
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'receipt' 
        AND policyname = 'receipt_delete_policy'
    ) THEN
        CREATE POLICY "receipt_delete_policy" ON "public"."receipt"
            FOR DELETE
            USING (true);
    END IF;
END $$;
