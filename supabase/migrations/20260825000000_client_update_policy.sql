-- Migración SQL: Política RLS para permitir actualizar el nombre del cliente
-- Fecha: 2026-08-25
--
-- La tabla client solo tenía políticas de INSERT y SELECT. El dashboard
-- ahora permite editar el nombre de un cliente (por número de teléfono),
-- pero sin una política de UPDATE, Postgres RLS filtra el UPDATE a 0 filas
-- afectadas sin lanzar error, dejando la UI creyendo que el cliente no existe.

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'client'
        AND policyname = 'client_update_authenticated_only'
    ) THEN
        CREATE POLICY "client_update_authenticated_only" ON "public"."client"
            FOR UPDATE
            USING (auth.role() = 'authenticated')
            WITH CHECK (auth.role() = 'authenticated');
    END IF;
END $$;
