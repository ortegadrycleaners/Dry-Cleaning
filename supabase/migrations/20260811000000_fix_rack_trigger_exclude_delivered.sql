-- Fix: enforce_rack_single_customer() blocked reusing a rack number from an
-- order that was already ENTREGADO/ABANDONADO, even though the app-level
-- check (fetchRackConflict in ordersService.ts) explicitly allows it.
-- This brought the DB-level rule in line with the app-level rule.

CREATE OR REPLACE FUNCTION public.enforce_rack_single_customer()
RETURNS TRIGGER AS $$
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
      AND status NOT IN ('ENTREGADO', 'ABANDONADO')
  ) THEN
    RAISE EXCEPTION 'El rack % ya está asignado a otro cliente.', NEW.rack_number;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
