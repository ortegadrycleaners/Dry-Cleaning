# Twilio SMS — Diagnóstico y contexto de fallos

> **Actualización 2026-07-31:** los dos hallazgos críticos de este documento
> (reclamo de idempotencia irreversible y falta de manejo de opt-out) ya se
> corrigieron. Ver `supabase/migrations/20260731000000_reminder_retry_and_optout.sql`,
> los helpers nuevos en `_shared/guards.ts` (`checkOptOut`, `markSmsSendFailed`,
> `markReminderNotificationResult`, `claimIdempotency` retry-safe) y la nueva
> función `supabase/functions/twilio-inbound-sms`. El resto de este documento
> se conserva como registro histórico del diagnóstico original.

> Referencia complementaria a [`TWILIO_SETUP.md`](TWILIO_SETUP.md) (cómo configurar) y
> [`AUTOMATED_REMINDERS.md`](AUTOMATED_REMINDERS.md) / [`REMINDER_RUNNER.md`](REMINDER_RUNNER.md)
> (cómo se disparan los envíos). Este documento resume **qué ha fallado en producción**
> según los logs exportados de Twilio, para servir de contexto rápido en futuros
> diagnósticos (humanos o IA) sin tener que re-analizar el CSV cada vez.

Fuente analizada: `sms-log-AC8cbd0875..._2026-07-31.csv`
(21 registros, ventana 2026-07-19 → 2026-07-30, cuenta `AC8cbd0875...`).

---

## 1. Resumen ejecutivo

- **21 registros** en el export: **13 `outbound-api`** (envíos reales de la app) y
  **8 `inbound`** (auto-respuestas generadas por el propio Twilio, no por nuestra app).
- De los 13 envíos salientes: **8 `delivered` (61.5%)**, **4 `failed` con código
  `21704` (30.8%)**, **1 `undelivered` con código `30034` (7.7%)**.
- Los 8 registros `inbound` son **100% `failed` con código `30039`** — no representan
  fallos de nuestros envíos, sino la respuesta automática de demo de Twilio ("Thanks
  for the message. Configure your number's SMS URL...") chocando con su propio filtro
  anti-loop.
- **Hallazgo crítico y accionable:** los 4 errores `21704` tienen el campo `From` vacío
  en el log, lo que confirma que esos intentos se hicieron vía `MessagingServiceSid`
  **con el Sender Pool del Messaging Service vacío** (sin ningún número asignado).
  El commit reciente que elimina el fallback a `TWILIO_FROM` y exige
  `TWILIO_MESSAGING_SERVICE_SID` (ver `supabase/functions/send-reminder*/index.ts`)
  **no es suficiente por sí solo**: si el Messaging Service en la consola de Twilio no
  tiene un número/Sender agregado a su pool, todos los envíos seguirán fallando con
  `21704` en vez de `30034`.
- El único `undelivered` con `30034` (A2P 10DLC — número sin registrar) ocurrió cuando
  el envío sí llevaba un `From` directo (`+16084548681`), confirmando la causa raíz que
  ya motivó el cambio de código a "solo Messaging Service".
- Costo estimado del log: ~US$0.087 totales, de los cuales ~US$0.020 (23%) corresponden
  a intentos fallidos (Twilio cobra aunque el mensaje no se entregue).

### Línea de tiempo relevante (más reciente primero)

| Fecha/hora | Evento | Código |
|---|---|---|
| 2026-07-30 19:11 | Envío directo con `From=+16084548681` → bloqueado | `30034` |
| 2026-07-30 19:05 / 18:54 | Envíos directos con `From` → entregados | `0` |
| 2026-07-30 18:39 | Envío vía Messaging Service, pool vacío | `21704` |
| 2026-07-30 17:46 / 17:48 | Envío vía Messaging Service, pool vacío | `21704` |
| 2026-07-28 21:37 | Envío vía Messaging Service, pool vacío | `21704` |
| 2026-07-19 → 2026-07-23 | Pruebas manuales ("Ahoy 👋", test) con `From` directo | `0` (delivered) |

Lectura: se estuvo alternando entre `From` directo (funcionaba hasta que A2P 10DLC lo
bloqueó) y Messaging Service (fallaba porque el pool estaba vacío). El fix de código ya
aplicado resuelve la rama `30034`, pero **queda pendiente poblar el Sender Pool del
Messaging Service en la consola de Twilio** para no reemplazar un error por otro.

### Nota sobre los números involucrados

- `+16084548681` — número remitente de la app en la mayoría de envíos `outbound-api`.
- `+19047535314` — destinatario real (cliente "Cardenas" en las plantillas).
- `+18777804236` — número toll-free usado como destino en pruebas manuales; genera las
  8 respuestas automáticas de demo (`30039`). No requiere acción sobre nuestro código,
  pero si se planea usar como número de producción, necesita verificación toll-free y
  un webhook de SMS propio (ver checklist §3).

---

## 2. Matriz de errores comunes

| Código | Nombre (Twilio) | Causa probable en nuestro stack | Protocolo de solución rápida |
|---|---|---|---|
| `30034` | US A2P 10DLC — Message from an Unregistered Number | Se envió con un `From` directo que no pertenece a una campaña A2P 10DLC registrada (o el registro está pendiente). | Confirmar que `sendTwilioSms` en `send-reminder-sms/index.ts` y `send-reminders/index.ts` **solo** use `MessagingServiceSid` (ya forzado en código). Verificar en Twilio Console → Messaging → A2P 10DLC que la campaña esté `Verified`, no `In Review`. |
| `21704` | The Messaging Service contains no phone numbers | El secreto `TWILIO_MESSAGING_SERVICE_SID` apunta a un Messaging Service cuyo **Sender Pool está vacío** (sin números, short code ni Alphanumeric Sender ID). | En Twilio Console → Messaging → Services → (el SID en uso) → **Sender Pool** → agregar al menos un número SMS-capable ya verificado. Sin esto, todo envío fallará aunque el código esté correcto. |
| `21703` | The Messaging Service does not have a phone number available to send a message | Variante de lo anterior: el pool tiene números pero ninguno disponible para el destino (p. ej. geo-permissions o capacidad). | Revisar Geo Permissions del Messaging Service y que el/los números del pool tengan capacidad SMS habilitada para el país de destino. |
| `30039` | Filtered to Prevent Message Loops | Mensaje entrante identificado por Twilio como generado automáticamente (típicamente la respuesta de demo "Thanks for the message...") — Twilio bloquea el reenvío para evitar un bucle bot-a-bot. No es un fallo de nuestros envíos salientes. | Si el número recibe respuestas reales de clientes (STOP/HELP/consultas), configurar un **SMS URL / webhook de entrada** propio en el número (Console → Phone Numbers → el número → Messaging → "A message comes in") en vez de dejar la respuesta de demo por defecto. |
| `21606` | The 'From' phone number is not a valid, SMS-capable inbound phone number | El número en `TWILIO_FROM`/Sender Pool no tiene SMS habilitado o no existe en la cuenta. | Confirmar en Console que el número está activo, es SMS-capable y pertenece a la cuenta con el `TWILIO_ACCOUNT_SID` configurado. |
| `21211` | Invalid 'To' Phone Number | El teléfono del cliente no pasó una normalización E.164 real (formato inválido llegó hasta la llamada a Twilio). | Revisar `normalizeToE164`/`isValidE164` en `_shared/phoneValidation.ts` — no debería llegar a Twilio un número inválido; si ocurre, es un bug de validación, no de Twilio. |
| `21610` | Message cannot be sent to unsubscribed recipient (STOP) | El destinatario respondió `STOP` previamente y Twilio lo bloqueó a nivel carrier/cuenta. | Es comportamiento esperado (opt-out). Verificar que el guard `sms_opt_out` / tabla de bloqueo en `guards.ts` esté sincronizado para no reintentar ese número. |

---

## 3. Checklist de verificación antes de disparar un SMS

Aplica a `send-reminder-sms/index.ts` y `send-reminders/index.ts` (ambos comparten la
misma forma de `sendTwilioSms`):

- [ ] **`TWILIO_MESSAGING_SERVICE_SID` configurado** como secreto de la Edge Function
      (`supabase secrets set ...`) — sin él, la función ya lanza error antes de llamar
      a Twilio (comportamiento correcto, ver commit que retiró `TWILIO_FROM`).
- [ ] **Sender Pool del Messaging Service no vacío** — verificar manualmente en Twilio
      Console (no se puede validar desde el código; es config de la cuenta). Este es el
      punto que causó los 4 errores `21704` de este log.
- [ ] **Campaña A2P 10DLC en estado `Verified`** si el volumen o el tipo de tráfico lo
      requiere — evita recaer en `30034` incluso usando Messaging Service, si el
      número dentro del pool no está vinculado a una campaña aprobada.
- [ ] **Teléfono normalizado a E.164** antes de construir el payload — ya se hace vía
      `normalizeToE164` / `isValidE164` (`_shared/phoneValidation.ts`); no enviar si
      `isValidE164` devuelve `false`.
- [ ] **`StatusCallback` incluido** en cada `Messages.create` — ya implementado
      (`STATUS_CALLBACK_URL` → `twilio-status-callback`), permite reconciliar
      `delivered`/`undelivered`/`failed` sin depender de exportar el CSV manualmente.
- [ ] **Respuesta de error de Twilio capturada y logueada de forma estructurada** —
      hoy se concatena en un string (`Twilio error ${status}: ${text}`); ver
      recomendación en §4 para parsear `code`/`message`/`more_info` como JSON.
- [ ] **Idempotencia aplicada antes del envío** (`claimIdempotency`) para que un retry
      no duplique el cargo ni el mensaje.
- [ ] **Webhook de entrada configurado** en el número de Twilio si se esperan
      respuestas de clientes (STOP/HELP/consultas) — evita que Twilio use su
      auto-respuesta de demo, que es la causa de todos los `30039` de este log.

---

## 4. Recomendaciones de logging interno

**Estado actual:**

- `send-reminder-sms/index.ts` — los dos flujos (`handleReminderFlow`,
  `handleOrderNotifyFlow`) sí hacen `console.error('...SMS error:', err)` en el catch,
  por lo que un fallo de Twilio queda visible en `supabase functions logs
  send-reminder-sms`. Bien.
- `send-reminders/index.ts` — el loop que procesa recordatorios en batch
  (línea ~130-136) captura el error de `sendTwilioSms` y lo agrega al array `results`
  devuelto en la respuesta HTTP, **pero no llama a `console.error`**. Como esta función
  se invoca típicamente desde un cron/`pg_cron` sin que nadie lea el body de la
  respuesta, **los fallos individuales de este runner quedan invisibles en los logs**
  de Supabase salvo que se inspeccione manualmente el JSON de retorno.
- En ambos archivos, el error de Twilio se envuelve como
  `` `Twilio error ${resp.status}: ${text}` `` — el `code` (`30034`, `21704`, etc.) de
  Twilio queda enterrado dentro de un string libre, no como campo estructurado. Esto
  obliga a re-descargar el CSV de Twilio para diagnosticar en vez de poder grepear los
  logs de Supabase por código de error.

**Sugerencias concretas:**

1. En el loop de `send-reminders/index.ts`, agregar `console.error` antes del
   `results.push` en el catch (línea ~135), igual que ya hacen los flujos de
   `send-reminder-sms`.
2. Parsear el body de error de Twilio como JSON (Twilio siempre devuelve
   `{ code, message, more_info, status }` en 4xx/5xx) en vez de usar el texto crudo, y
   loguear un objeto estructurado, por ejemplo:

   ```ts
   if (!resp.ok) {
     const raw = await resp.text();
     let twilioError: { code?: number; message?: string; more_info?: string } = {};
     try { twilioError = JSON.parse(raw); } catch { /* respuesta no-JSON */ }
     console.error(JSON.stringify({
       event: 'twilio_send_failed',
       httpStatus: resp.status,
       twilioCode: twilioError.code,
       twilioMessage: twilioError.message,
       moreInfo: twilioError.more_info,
       to, // ya normalizado a E.164, no PII adicional más allá del teléfono del envío
     }));
     throw new Error(`Twilio ${resp.status} (${twilioError.code ?? 'sin código'}): ${twilioError.message ?? raw}`);
   }
   ```

   Esto permite filtrar logs de Supabase por `"twilioCode":30034` o `"twilioCode":21704`
   sin exportar CSVs, y da a un futuro diagnóstico (IA o humano) la matriz de la §2 como
   referencia directa.
3. Considerar exponer `twilioErrorCode` en el objeto `results`/response de
   `send-reminders` y en la respuesta `TWILIO_API_ERROR` de `send-reminder-sms`, no solo
   el string de error, para que el frontend (modal de recordatorios) pueda mostrar un
   mensaje específico en vez de un genérico "algo falló".
4. Ya existe `twilio-status-callback` guardando `error_code`/`error_message` en
   `sms_sends` (ver `TWILIO_SETUP.md` §3bis) — es la fuente más confiable porque viene
   directo de Twilio de forma asíncrona. Verificar periódicamente esa tabla
   (`SELECT error_code, count(*) FROM sms_sends WHERE status IN ('failed','undelivered') GROUP BY error_code`)
   en vez de depender de exportar CSVs manualmente desde la consola de Twilio.

---

*Generado a partir del análisis del CSV `sms-log-AC8cbd0875..._2026-07-31.csv`
el 2026-07-31. Actualizar esta matriz cuando aparezcan nuevos códigos de error no listados.*
