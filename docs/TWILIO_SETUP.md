# Twilio SMS — Guía de configuración y uso

Esta guía cubre cómo enchufar Twilio al backoffice de la tintorería para que el
botón **“SMS cliente”** envíe un SMS real cuando una orden se marque
como `LISTO`.

> **TL;DR — solo después del despliegue base**
>
> Esta guía es la **Etapa 2**. Antes debes tener en producción login, órdenes y tracking
> con `VITE_TWILIO_MOCK=true` ([`DEPLOYMENT_PHASES.md`](DEPLOYMENT_PHASES.md)).
>
> 1. Cuenta Twilio + número remitente.
> 2. Secretos `TWILIO_*` y `PUBLIC_APP_URL` en Supabase; `supabase functions deploy send-reminder-sms`.
> 3. `docs/sms_sends_migration.sql` (si no se ejecutó en Etapa 1).
> 4. En producción: `VITE_TWILIO_MOCK=false`, rebuild y redeploy del frontend.
> 5. Lee [Mecanismos de protección](#mecanismos-de-protección).

---

## 1. Por qué el frontend NO habla con Twilio directamente

El SDK / API REST de Twilio exige el **Account SID + Auth Token**. Ese par es
equivalente a una llave maestra: con él se pueden gastar **todos los créditos**
de la cuenta. Si los pones en el bundle de Vite (incluso bajo `VITE_*`), quedan
expuestos a cualquier cliente que abra DevTools, y verás cobros sorpresa.

Patrón correcto:

```
Browser (operador) ──HTTPS──▶  Backend propio  ──HTTPS──▶  api.twilio.com
                                  ▲
                       (custodia el Auth Token)
```

Recomendación: **Supabase Edge Function**. Es gratis hasta cierta cuota, ya
estás usando Supabase como base de datos, y tiene secretos por proyecto.
Cualquier otro backend HTTP también vale (Vercel Function, AWS Lambda, etc.).

---

## 2. Crear la cuenta y el número en Twilio

1. Regístrate en https://www.twilio.com/try-twilio.
2. Anota:
   - **Account SID** (empieza con `AC...`)
   - **Auth Token**
3. **Compra o reserva un número de envío SMS** (Phone Numbers → Buy a Number).
   - Para PR / US: pide capacidad **SMS** y, si tu volumen lo justifica,
     registra un **A2P 10DLC** brand/campaign para evitar filtrado por carriers.
4. Define límites duros en Twilio:
   - Console → Programmable Messaging → **Geo Permissions**: solo activa los
     países a los que vas a enviar (PR/US).
   - Console → Account → **Usage Triggers**: crea un trigger que **deshabilite
     la cuenta** al pasar X USD/día. Es la última red de seguridad detrás de
     las protecciones de la app.

---

## 3. Endpoint backend: `send-reminder-sms` (unificado)

La función `supabase/functions/send-reminder-sms` atiende:

- `flow: 'order_notify'` — SMS desde el dashboard (orden lista, recordatorios manuales).
- `flow: 'reminder'` — SMS desde el modal de recordatorios automáticos.

Despliegue:

```bash
supabase functions deploy send-reminder-sms
supabase secrets set TWILIO_ACCOUNT_SID=... TWILIO_AUTH_TOKEN=... TWILIO_FROM=+1...
```

El frontend invoca vía `supabase.functions.invoke('send-reminder-sms')` con el JWT
del operador. No hace falta `VITE_NOTIFY_ENDPOINT_URL` salvo override legacy.

---

## 3bis. Tracking de entrega: `twilio-status-callback`

Twilio notifica cambios de estado de cada SMS (`queued` → `sent` →
`delivered`/`undelivered`/`failed`) vía webhook. La función
`supabase/functions/twilio-status-callback` recibe ese POST y actualiza
`sms_sends.status` (más `error_code`/`error_message` si Twilio reporta un
fallo) buscando la fila por `message_sid`.

`send-reminder-sms` y `send-reminders` ya envían `StatusCallback` en cada
`Messages.create`, apuntando por defecto a
`${SUPABASE_URL}/functions/v1/twilio-status-callback` (override con el
secreto opcional `TWILIO_STATUS_CALLBACK_URL` si usas un dominio propio).

Despliegue:

```bash
# --no-verify-jwt: Twilio no manda un JWT de Supabase, solo X-Twilio-Signature
supabase functions deploy twilio-status-callback --no-verify-jwt
supabase secrets set TWILIO_AUTH_TOKEN=...   # ya debería estar seteado
```

Aplica también la migración `supabase/migrations/20260719000000_sms_status_callback.sql`
(agrega `status`, `error_code`, `error_message`, `status_updated_at` a `sms_sends`
más un índice por `message_sid`).

El endpoint valida `X-Twilio-Signature` con el mismo `TWILIO_AUTH_TOKEN` que usa el
envío — si no coincide devuelve `403` sin tocar la base de datos. Responde `204`
en éxito (Twilio no necesita cuerpo de respuesta en un status callback).

### Referencia histórica: `notify-order-ready`

Antes se documentaba una función separada `notify-order-ready` que:

1. **Autentica** al operador (JWT del backoffice o API key + RLS).
2. Lee la orden por `orderId` desde Supabase y **valida que está en `LISTO`**.
3. Resuelve el teléfono **desde la BD canónica**, ignorando lo que mande el
   cliente.
4. Comprueba **idempotency key** (UNIQUE en una tabla `sms_sends`).
5. Aplica los **mismos límites** que el frontend (rate-limit, presupuesto).
6. Llama a Twilio `Messages.create({ to, from, body })`.
7. Persiste el resultado (`message_sid`, `status`, `cost`) en `sms_sends`.

Esqueleto en Deno (`supabase/functions/notify-order-ready/index.ts`):

```ts
import { serve } from "https://deno.land/std/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const TWILIO_SID = Deno.env.get("TWILIO_ACCOUNT_SID")!;
const TWILIO_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN")!;
const TWILIO_FROM = Deno.env.get("TWILIO_FROM_NUMBER")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const DAILY_BUDGET = Number(Deno.env.get("SMS_DAILY_BUDGET") ?? "200");

interface Body {
  orderId: string;
  templateType: "ORDER_READY";
  idempotencyKey: string;
  operatorId: string;
}

function render(type: Body["templateType"], o: {
  customerName: string; orderNumber: string;
  trackingUrl: string; rackNumber?: string;
}): string {
  if (type === "ORDER_READY") {
    const rack = o.rackNumber ? ` Rack #${o.rackNumber}.` : "";
    return `Tintoreria: ${o.customerName}, tu orden #${o.orderNumber} esta lista para recoger.${rack} Detalle: ${o.trackingUrl}`;
  }
  throw new Error("Plantilla desconocida");
}

serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const body = (await req.json()) as Body;
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  // 1. Autenticación (ejemplo: JWT en Authorization).
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) {
    return Response.json({ ok: false, errorCode: "UNAUTHENTICATED" }, { status: 401 });
  }

  // 2. Idempotency: si la key ya existe, NO se envía otro SMS.
  const { data: existing } = await supabase
    .from("sms_sends")
    .select("message_sid, status")
    .eq("idempotency_key", body.idempotencyKey)
    .maybeSingle();
  if (existing) {
    return Response.json({ ok: true, messageSid: existing.message_sid, status: existing.status });
  }

  // 3. Presupuesto diario.
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const { count } = await supabase
    .from("sms_sends")
    .select("id", { count: "exact", head: true })
    .gte("sent_at", since);
  if ((count ?? 0) >= DAILY_BUDGET) {
    return Response.json({ ok: false, errorCode: "DAILY_BUDGET_EXCEEDED" }, { status: 429 });
  }

  // 4. Lee la orden y valida estado.
  const { data: order } = await supabase
    .from("orders")
    .select("id, order_number, status, rack_number, customer:customers(name, phone, sms_opt_out)")
    .eq("id", body.orderId)
    .single();

  if (!order || order.status !== "LISTO") {
    return Response.json({ ok: false, errorCode: "INVALID_ORDER_STATE" }, { status: 422 });
  }
  if (order.customer?.sms_opt_out) {
    return Response.json({ ok: false, errorCode: "FORBIDDEN", errorMessage: "Cliente con opt-out de SMS." }, { status: 403 });
  }

  // 5. Renderiza el mensaje en el backend (NO se confía en el cliente).
  const trackingUrl = `${Deno.env.get("PUBLIC_APP_URL")}/tracking/${order.id}`;
  const message = render(body.templateType, {
    customerName: order.customer.name,
    orderNumber: order.order_number,
    trackingUrl,
    rackNumber: order.rack_number ?? undefined,
  });

  // 6. Llama a Twilio.
  const auth64 = btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`);
  const params = new URLSearchParams({
    From: TWILIO_FROM,
    To: order.customer.phone,
    Body: message,
  });
  const twilioRes = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth64}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params,
    },
  );
  const twilioBody = await twilioRes.json();

  if (!twilioRes.ok) {
    return Response.json({
      ok: false,
      errorCode: "TWILIO_API_ERROR",
      errorMessage: twilioBody.message ?? "Twilio rechazó el envío",
    }, { status: 502 });
  }

  // 7. Persiste el envío.
  await supabase.from("sms_sends").insert({
    order_id: order.id,
    operator_id: body.operatorId,
    idempotency_key: body.idempotencyKey,
    template_type: body.templateType,
    message_sid: twilioBody.sid,
    status: twilioBody.status,
    rendered_message: message,
    sent_at: new Date().toISOString(),
  });

  return Response.json({
    ok: true,
    messageSid: twilioBody.sid,
    status: twilioBody.status,
    renderedMessage: message,
  });
});
```

Tabla SQL mínima:

```sql
CREATE TABLE sms_sends (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id        TEXT NOT NULL,
  operator_id     TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  template_type   TEXT NOT NULL,
  message_sid     TEXT,
  status          TEXT,
  rendered_message TEXT,
  sent_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON sms_sends(order_id);
CREATE INDEX ON sms_sends(sent_at);
```

Despliegue:

```bash
supabase functions deploy notify-order-ready --no-verify-jwt=false
supabase secrets set \
  TWILIO_ACCOUNT_SID=AC... \
  TWILIO_AUTH_TOKEN=... \
  TWILIO_FROM_NUMBER=+1787XXXXXXX \
  PUBLIC_APP_URL=https://app.tu-tintoreria.com \
  SMS_DAILY_BUDGET=200
```

---

## 4. Conectar el frontend

1. Copia el archivo de ejemplo:

   ```bash
   cp app/.env.example app/.env
   ```

2. Edita `app/.env`:

   ```env
   VITE_NOTIFY_ENDPOINT_URL=https://<project>.functions.supabase.co/notify-order-ready
   VITE_NOTIFY_ENDPOINT_KEY=<JWT_publico_o_api_key>
   VITE_TWILIO_MOCK=false
   VITE_SMS_DAILY_BUDGET=200
   VITE_SMS_GLOBAL_PER_MINUTE=30
   VITE_SMS_PER_ORDER_HOURS=24
   VITE_SMS_COOLDOWN_MS=5000
   VITE_SMS_KILL_SWITCH=false
   ```

3. Reinicia Vite (`npm run dev`). En el modal de **“SMS cliente”** la
   sección de stats mostrará `Modo: PRODUCCIÓN`.

---

## 5. Mecanismos de protección

Defensa en profundidad — `frontend` aplica todo lo de abajo, y el `backend`
debe replicarlas (autoridad final). El frontend evita gasto y mejora UX; el
backend protege ante un cliente comprometido.

| # | Capa | Dónde se aplica | Configurable por |
|---|------|-----------------|------------------|
| 1 | Operador autenticado en backoffice | RequireAuth + JWT en backend | login |
| 2 | Botón único “SMS cliente” disponible solo en estado `LISTO` | DashboardPage | n/a |
| 3 | Botón se oculta si la orden ya fue notificada (lectura del historial) | DashboardPage | n/a |
| 4 | Modal de confirmación con preview del mensaje exacto | NotifyCustomerModal | n/a |
| 5 | Validación E.164 estricta del teléfono | `phoneValidation.ts` | n/a |
| 6 | Allowlist de teléfonos para QA | `protections.checkAllowlist` | `VITE_SMS_ALLOWLIST` |
| 7 | Cooldown anti doble-click | `protections.checkCooldown` | `VITE_SMS_COOLDOWN_MS` |
| 8 | Deduplicación persistente por `(orderId, type)` | `protections.checkDuplicate` | n/a |
| 9 | Rate-limit por orden (horas entre SMS) | `protections.checkPerOrderRateLimit` | `VITE_SMS_PER_ORDER_HOURS` |
| 10 | Rate-limit global por minuto | `protections.checkGlobalPerMinute` | `VITE_SMS_GLOBAL_PER_MINUTE` |
| 11 | Presupuesto diario (kill switch automático al agotarse) | `protections.checkDailyBudget` | `VITE_SMS_DAILY_BUDGET` |
| 12 | Kill switch global (env o runtime) | `config.killSwitch` | `VITE_SMS_KILL_SWITCH` + `setKillSwitchOverride()` |
| 13 | Idempotency key estable por `(orderId, type, día)` | `TwilioService` | n/a |
| 14 | Plantillas selladas — no editables desde la UI | `messageTemplates.ts` | revisión por PR |
| 15 | Mock mode automático si no hay endpoint configurado | `config.mockMode` | `VITE_TWILIO_MOCK` |
| 16 | Timeout de 15 s en la llamada al backend | `TwilioService.callBackend` | n/a |
| 17 | Twilio Geo Permissions y Usage Triggers a nivel cuenta | Console Twilio | n/a |

### Activar el kill switch en runtime (sin redeploy)

```ts
import { setKillSwitchOverride } from '@/services/twilio';

// Bloquear todos los envíos hasta nuevo aviso:
setKillSwitchOverride(true);

// Reactivar:
setKillSwitchOverride(false);

// Quitar el override (vuelve al valor de VITE_SMS_KILL_SWITCH):
setKillSwitchOverride(null);
```

Esta llamada se persiste en `localStorage` por sesión/dispositivo. Para un
kill switch global verdadero, replica este toggle en el backend (un flag en
una tabla `app_config`) y haz que la Edge Function lo consulte antes de
llamar a Twilio.

---

## 6. Uso desde el backoffice

1. El operador inicia sesión en `/login`.
2. En la tabla de órdenes, marca una orden `EN PROCESO` o `RECIBIDO` como
   `LISTO` mediante el botón **“Marcar Listo”** y completa el rack.
   - **Esta acción NO envía SMS.**
3. Aparece en la fila el botón único **“SMS cliente”**.
4. Al pulsarlo se abre el modal con:
   - Preview literal del SMS (no editable).
   - Conteo de caracteres y segmentos facturables.
   - Stats en vivo (último minuto, últimas 24 h, presupuesto restante).
   - Indicador de modo (`MOCK` vs `PRODUCCIÓN`) y kill switch.
5. **“Confirmar y enviar SMS”** ejecuta la cadena de protecciones; si todas
   pasan, llama al backend con la idempotency key. El backend se encarga del
   envío real.
6. Tras éxito el botón se reemplaza por **“Notificado”** y la fila no vuelve
   a permitir disparar otro SMS para esa orden.
7. Si algo falla, el modal muestra el motivo (`COOLDOWN_ACTIVE`,
   `DUPLICATE`, `DAILY_BUDGET_EXCEEDED`, `INVALID_PHONE`, etc.).

---

## 7. Errores normalizados

| Código | Significado |
|--------|-------------|
| `NOT_CONFIGURED` | Falta `VITE_NOTIFY_ENDPOINT_URL` y no estás en mock. |
| `UNAUTHENTICATED` | Backend rechazó el JWT/API key. |
| `FORBIDDEN` | El cliente tiene `sms_opt_out=true` o no tiene permiso. |
| `INVALID_PHONE` | Teléfono no normalizable a E.164. |
| `INVALID_ORDER_STATE` | Orden no está en `LISTO` o falta rack. |
| `DUPLICATE` | Ya hay un SMS de este tipo para esta orden. |
| `RATE_LIMIT_PER_ORDER` | Otro SMS para esta orden en la ventana configurada. |
| `RATE_LIMIT_GLOBAL` | Más de N SMS/min en todo el sistema. |
| `DAILY_BUDGET_EXCEEDED` | Se llegó al cap diario. |
| `KILL_SWITCH_ON` | Switch maestro activo. |
| `COOLDOWN_ACTIVE` | Demasiado rápido tras el envío anterior. |
| `ALLOWLIST_BLOCKED` | Modo QA y el destino no está en la lista. |
| `NETWORK` | Timeout o fallo de red al llamar al backend. |
| `TWILIO_API_ERROR` | Twilio devolvió un error (revisa el log del backend). |

---

## 8. Pruebas recomendadas

1. **Mock mode** (default): valida UI, dedup, rate-limit y cooldown sin gastar
   créditos.
2. **Allowlist** con tu teléfono personal: SMS reales solo a ti.
3. **Carga**: simula 100 órdenes lista en burst y comprueba que `globalPerMinute`
   y `dailyBudget` se respetan.
4. **Kill switch**: actívalo en el panel admin y verifica que el botón
   queda deshabilitado.
5. **Idempotency**: invoca dos veces seguidas. La segunda debe responder
   con la misma `messageSid` SIN llamar a Twilio (verifica en el dashboard
   de Twilio que solo aparece un SMS).
