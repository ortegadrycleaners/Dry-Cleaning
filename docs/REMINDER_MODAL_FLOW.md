# Flujo de Recordatorios Automáticos - Versión Modal

Este documento describe el nuevo flujo donde Supabase detecta órdenes que necesitan recordatorio y muestra un modal prioritario en el Dashboard para que el admin envíe SMS manualmente.

## Arquitectura

```
┌─────────────────────────────────────────────────────────────┐
│ Supabase (Backend)                                          │
├─────────────────────────────────────────────────────────────┤
│ 1. Cron Job / Scheduler: Daily                              │
│    Ejecuta: detect_reminders_and_create_tasks()             │
│    Detección: Órdenes status=LISTO en día 3/5/30            │
│    Acción: INSERT en receipt_reminder_task (status=pending) │
└─────────────────────────────────────────────────────────────┘
                              ↓
                         Realtime
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ Frontend (Dashboard)                                        │
├─────────────────────────────────────────────────────────────┤
│ ReminderTaskHandler (component)                             │
│   - Suscribe a receipt_reminder_task (status=pending)       │
│   - Muestra ReminderModal (NO closeable)                    │
│   - Admin: click "Enviar SMS" o "Omitir por ahora"          │
└─────────────────────────────────────────────────────────────┘
                              ↓
                    Admin makes choice
                              ↓
        ┌─────────────────────────────────┐
        │  Send SMS                       │
        └─────────────────────────────────┘
                    ↓
    Frontend calls send-reminder-sms
    Edge Function (Deno)
                    ↓
    Twilio REST API (sends SMS)
                    ↓
    On success:
    - Update receipt_reminder_task status='sent'
    - Load next pending task
```

## Setup

### 1. Aplicar Migraciones SQL

Ejecuta en el SQL editor de Supabase:

```sql
-- docs/supabase_reminder_task_migration.sql
```

Esto crea:
- Tabla `receipt_reminder_task` (tareas pendientes)
- Función `detect_reminders_and_create_tasks(p_tz)` (detecta órdenes)

### 2. Desplegar Edge Functions

```bash
# Configura secrets de Twilio
supabase secrets set \
  TWILIO_ACCOUNT_SID="<sid>" \
  TWILIO_AUTH_TOKEN="<token>" \
  TWILIO_FROM="+1234567890"

# Despliega la función de envío SMS
supabase functions deploy send-reminder-sms
```

### 3. Integrar en React

Añade `ReminderTaskHandler` en tu DashboardPage o layout principal:

```tsx
import { ReminderTaskHandler } from '@/components/ReminderTaskHandler';
import { DashboardContent } from '@/pages/DashboardPage';

export function DashboardPage() {
  return (
    <>
      <ReminderTaskHandler />
      <DashboardContent />
    </>
  );
}
```

### 4. Programar el Cron

Opción A: GitHub Actions (free)

```yaml
# .github/workflows/detect-reminders.yml
name: Detect Reminders
on:
  schedule:
    - cron: '0 6 * * *'  # 6 AM UTC daily

jobs:
  detect:
    runs-on: ubuntu-latest
    steps:
      - name: Detect reminder tasks
        run: |
          curl -X POST https://<your-project>.supabase.co/rest/v1/rpc/detect_reminders_and_create_tasks \
            -H "Authorization: Bearer ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}" \
            -H "Content-Type: application/json" \
            -d '{"p_tz": null}'
```

Opción B: Supabase Database Webhooks (si disponible)

- Crea un webhook que llame a un endpoint que ejecute la función RPC.

Opción C: Servidor cron externo

```bash
# Ejecuta diariamente (ej. en servidor)
0 6 * * * curl -s -X POST https://<your-project>.supabase.co/rest/v1/rpc/detect_reminders_and_create_tasks \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"p_tz": null}'
```

## Flujo de Usuario

1. **Supabase detecta órdenes** (cron diario 6 AM)
   - Crea tareas con status='pending'
   - Incluye detalles de orden, cliente, teléfono, mensaje

2. **Admin abre Dashboard**
   - ReminderTaskHandler está subscrito a cambios
   - Un modal flotante no-closeable aparece con la primera tarea

3. **Admin ve la tarea**
   - Orden #123 | Cliente: Juan | 5 días en rack (URGENTE)
   - Botones: "Omitir por ahora" | "Enviar SMS"

4. **Admin elige acción**
   - **Enviar SMS**: 
     - Frontend envía a Edge Function
     - Twilio envía el SMS
     - receipt_reminder_task status → 'sent'
     - Modal se cierra, carga siguiente tarea
   - **Omitir por ahora**:
     - receipt_reminder_task status → 'skipped'
     - Modal se cierra, carga siguiente tarea

5. **Sin tareas pendientes**
   - Modal desaparece
   - Dashboard operativo normal

## Componentes

### ReminderModal
- Componente no-closeable (no tiene botón X)
- Muestra detalles de la orden
- Indicador de prioridad (5+ días = ROJO)
- Botones de acción

### ReminderTaskHandler
- Subscripción realtime a `receipt_reminder_task`
- Gestiona el estado de la tarea actual
- Carga siguiente tarea tras acción

### reminderService
- `sendReminderSms()`: Envía SMS y actualiza status
- `skipReminderTask()`: Marca tarea como 'skipped'

### Edge Function: send-reminder-sms
- Recibe: taskId, phone, message
- Envía SMS vía Twilio
- Devuelve: ok, messageSid o error

## Testing

### Test local (sin Twilio)

Modifica `send-reminder-sms/index.ts` para usar mock:

```typescript
async function sendSms(to: string, body: string) {
  console.log(`[MOCK] SMS to ${to}: ${body}`);
  return { sid: 'SM_' + Math.random().toString(36).substr(2, 9) };
}
```

### Test en Supabase (sandbox)

1. Crea órdenes de prueba con `status_updated_at` hace 3/5/30 días.
2. Ejecuta manualmente:
   ```sql
   SELECT * FROM public.detect_reminders_and_create_tasks(NULL);
   ```
3. Verifica filas en `receipt_reminder_task`:
   ```sql
   SELECT * FROM public.receipt_reminder_task WHERE status = 'pending';
   ```

### Test Frontend

1. Navega al Dashboard
2. ReminderTaskHandler debe mostrar el modal con la tarea

## Notas de Seguridad

- La función `detect_reminders_and_create_tasks` debe ejecutarse con **service_role** privileges.
- El frontend (anon key) solo puede **leer y actualizar status** de `receipt_reminder_task`.
- Configura RLS en la tabla para que:
  - Anon: pueda leer/actualizar solo rows con status != 'pending' (leyenda: admin aprobó)
  - Service role: acceso completo

Ejemplo RLS:
```sql
ALTER TABLE receipt_reminder_task ENABLE ROW LEVEL SECURITY;

-- Anon users can read and update non-pending tasks only
CREATE POLICY "allow_anon_read_update_non_pending" ON receipt_reminder_task
  FOR ALL USING (true)
  WITH CHECK (auth.role() = 'authenticated' OR status != 'pending');

-- Service role bypasses RLS
```

## Mejoras Futuras

- [ ] Agregar campo `notes` para que admin deje comentarios
- [ ] Agregar historial de intentos fallidos
- [ ] Reagendar tarea si falla Twilio (retry con backoff)
- [ ] Dashboard de estadísticas: sent vs skipped
- [ ] Notificaciones browser para admin (Toastr/push)
