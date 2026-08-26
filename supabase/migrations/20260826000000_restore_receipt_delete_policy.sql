-- Migración SQL: Restaura la política RLS de eliminación (DELETE) para la tabla receipt
-- Fecha: 2026-08-26
-- Nota: la migración original (20260819_backup_and_delete_policy.sql) fue eliminada del
-- repositorio sin down-migration. En entornos ya migrados (producción) la política sigue
-- activa, pero en un entorno nuevo (dev/staging/CI, `supabase db reset`) nunca se crea,
-- por lo que deleteOrderFromDb() falla por RLS. Esta migración es idempotente y restaura
-- la política para cualquier entorno.

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
