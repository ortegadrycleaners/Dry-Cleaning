# Automatización de Recordatorios de Día 3 / 5 / 30

Este documento describe la arquitectura propuesta para automatizar los recordatorios de órdenes pendientes sin mezclar el estado de notificaciones en la tabla principal de `receipt`.

## Objetivo

Separar el dominio de órdenes del dominio de recordatorios para:

- evitar antipatrones de responsabilidad única
- reducir bloqueos y cuellos de botella en la tabla principal
- lograr idempotencia al enviar SMS
- permitir control preciso de qué mensajes ya fueron enviados

## Arquitectura propuesta

### 1. Tabla auxiliar de tracking

Crear una tabla independiente que registre cada recordatorio enviado.

Ejemplo:

```sql
CREATE TABLE IF NOT EXISTS receipt_reminder_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_id uuid NOT NULL REFERENCES receipt(id_order) ON DELETE CASCADE,
  milestone int NOT NULL CHECK (milestone IN (3, 5, 30)),
  sent_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (receipt_id, milestone)
);
```

Alternativa con tipos de notificación:

```sql
CREATE TABLE IF NOT EXISTS receipt_notification_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_id uuid NOT NULL REFERENCES receipt(id_order) ON DELETE CASCADE,
  notification_type text NOT NULL CHECK (notification_type IN ('PICKUP_REMINDER','URGENT_REMINDER','DAY_30_REMINDER')),
  sent_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (receipt_id, notification_type)
);
```

### 2. Condición de negocio correcta

En este proyecto, los recordatorios deben basarse en cuándo la orden se marcó como `LISTO`, no en su fecha de creación.

La tabla actual usa `status_updated_at` para guardar el momento del último cambio de estado y `days_ready` se actualiza a `0` cuando se marca como `LISTO`.

### 3. Consulta diaria precisa

El barrido se ejecuta una vez al día y solo devuelve las órdenes que cumplen el hito exacto y que aún no tienen registro en la tabla auxiliar.

```sql
SELECT r.id_order AS receipt_id,
       CASE
         WHEN r.status_updated_at::DATE = (CURRENT_DATE - INTERVAL '3 days')::DATE THEN 3
         WHEN r.status_updated_at::DATE = (CURRENT_DATE - INTERVAL '5 days')::DATE THEN 5
         WHEN r.status_updated_at::DATE = (CURRENT_DATE - INTERVAL '30 days')::DATE THEN 30
       END AS milestone
FROM receipt r
LEFT JOIN receipt_reminder_log log
  ON r.id_order = log.receipt_id
  AND log.milestone = CASE
    WHEN r.status_updated_at::DATE = (CURRENT_DATE - INTERVAL '3 days')::DATE THEN 3
    WHEN r.status_updated_at::DATE = (CURRENT_DATE - INTERVAL '5 days')::DATE THEN 5
    WHEN r.status_updated_at::DATE = (CURRENT_DATE - INTERVAL '30 days')::DATE THEN 30
  END
WHERE r.status = 'LISTO'
  AND r.status_updated_at::DATE IN (
    (CURRENT_DATE - INTERVAL '3 days')::DATE,
    (CURRENT_DATE - INTERVAL '5 days')::DATE,
    (CURRENT_DATE - INTERVAL '30 days')::DATE
  )
  AND log.id IS NULL;
```

### 4. Flujo de ejecución

1. El scheduler ejecuta el proceso una vez al día en una hora de baja carga.
2. Se ejecuta la consulta SQL para extraer los `receipt` que cumplen el día 3, 5 o 30.
3. Si hay resultados, se envía el payload a la función/servicio encargado de SMS.
4. Después de un envío exitoso, se graba la fila en `receipt_reminder_log`.

## Beneficios

- la tabla `receipt` queda enfocada en el dominio de órdenes
- el log es la llave de idempotencia para evitar duplicados
- la lógica de fecha se resuelve en la base de datos
- el historial de envíos queda auditable

## Consideraciones específicas para este repositorio

### Implementación actual

Hoy la app usa:

- un servicio frontend `NotificationService`
- `localStorage` para persistir el log de notificaciones
- polling en `NotificationsContext` cada 5 minutos
- eventos in-app (`EventBus`)

Esto funciona como un MVP, pero no garantiza envíos en ausencia de un navegador abierto ni evita duplicados de manera global.

### Qué cambiar

- mover la deduplicación y el tracking de envíos a la base de datos
- usar una tabla auxiliar persistente en Supabase
- reemplazar el polling frontend por un proceso diario de servidor
- registrar el envío solo tras confirmar éxito real

### Días exactos vs rango

La implementación actual con `daysReady >= 3` y `>= 5` puede enviar recordatorios fuera del día exacto.

El diseño recomendado debe ser exacto: enviar el recordatorio solo el día 3, solo el día 5, y solo el día 30.

### Zona horaria

`CURRENT_DATE` en PostgreSQL se evalúa en UTC.

Si el negocio quiere que los hits se calculen según la hora local de la tienda, se debe normalizar el cálculo con la zona correcta:

```sql
(r.status_updated_at AT TIME ZONE 'America/Puerto_Rico')::DATE
```

O bien usar una zona local explícita para el proceso scheduler.

## Recomendación final

Para automatizar el recordatorio del tercer día correctamente:

- no usar la tabla principal `receipt` para almacenar flags de notificación
- usar una tabla auxiliar de reminders/notificaciones
- basar el cálculo en `status_updated_at` cuando la orden se marca `LISTO`
- ejecutar la lógica una vez al día en el servidor
- registrar solo envíos exitosos en el log
- manejar la zona horaria explícitamente si el negocio lo requiere

---

Este plan está pensado para que la solución sea confiable, escalable y compatible con la arquitectura actual del proyecto.`