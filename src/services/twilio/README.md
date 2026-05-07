# `services/twilio`

Subsistema de envío de SMS para el backoffice. Documentación completa:
[`docs/TWILIO_SETUP.md`](../../../docs/TWILIO_SETUP.md).

## Anatomía

| Archivo | Responsabilidad |
|---------|-----------------|
| `config.ts` | Lee `VITE_*`, expone `getTwilioConfig`, kill switch runtime. |
| `phoneValidation.ts` | Normalización a E.164. |
| `messageTemplates.ts` | Plantillas SELLADAS + estimación de segmentos. |
| `protections.ts` | 10+ guards de defensa en profundidad y stats de uso. |
| `TwilioService.ts` | `notifyOrderReady()` — único disparador de SMS. |
| `types.ts` | DTOs de petición/respuesta + `TwilioErrorCode`. |
| `index.ts` | Superficie pública del módulo. |

## API pública

```ts
import {
  notifyOrderReady,
  previewMessage,
  estimateSmsSegments,
  isTwilioReady,
  getUsageStats,
  setKillSwitchOverride,
} from '@/services/twilio';
```

`notifyOrderReady({ order, operatorId })` ejecuta:

1. `runAllGuards(order, 'ORDER_READY')`.
2. Resuelve cliente desde Supabase (`getCustomerForOrder`).
3. Construye idempotency key `${orderId}:ORDER_READY:${YYYY-MM-DD}`.
4. POST al endpoint backend con timeout de 15 s.
5. Si Twilio confirma, registra el envío y emite `ORDER_READY` al EventBus.

Devuelve `SendSmsResult` con `ok`, `errorCode` y `errorMessage`.

## Reglas inviolables

- **El bundle no contiene Auth Token de Twilio.** Las credenciales viven solo
  en el backend.
- **Las plantillas no se editan desde la UI.** Cambios solo por PR.
- **El backend es la autoridad final.** Los guards del frontend protegen el
  presupuesto y la UX, pero un atacante que evite el frontend siempre puede
  llamar al backend; el backend DEBE replicar todas las verificaciones.
