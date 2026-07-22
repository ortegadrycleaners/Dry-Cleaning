/**
 * Tipos del subsistema de envío de SMS vía Twilio.
 *
 * El frontend NO habla con Twilio directamente: nunca debe tener el Auth Token
 * en el bundle. En cambio invoca un endpoint backend (ver TWILIO_SETUP.md) que
 * custodia las credenciales y dispara la API real de Twilio.
 */

import type { NotificationEventType } from '@/types/notifications';

/* ---------- Solicitud / Respuesta del backend ---------- */

/**
 * Petición que el frontend envía al backend (Supabase Edge Function o API propia).
 *
 * NUNCA se envía el contenido del mensaje desde el cliente: el backend
 * resuelve la plantilla con datos canónicos de Supabase. Solo enviamos
 * referencias y un idempotency key.
 */
export interface NotifySmsRequest {
  /** ID interno de la orden (clave en Supabase). */
  orderId: string;
  /** Tipo de mensaje (limita qué plantilla puede aplicar el backend). */
  templateType: NotificationEventType;
  /**
   * Idempotency key estable por (orderId + templateType). Permite al backend
   * descartar reintentos accidentales sin generar SMS extra (Twilio cobra cada uno).
   */
  idempotencyKey: string;
  /**
   * Operador que dispara el envío (auditable). Útil para investigar abusos
   * y enforce de cuotas por usuario en el backend.
   */
  operatorId: string;
  /** Nota libre del operador — solo para ORDER_PROCESSED. Máx. 100 chars. */
  customNote?: string;
  /** Si true, omite la fecha estimada del mensaje (modo problema/avería). */
  omitEstimatedDate?: boolean;
}

export interface NotifySmsResponse {
  ok: boolean;
  /** SID de Twilio cuando ok=true. */
  messageSid?: string;
  /** Estado reportado por Twilio (queued|sending|sent|failed|...). */
  status?: string;
  /** Mensaje renderizado por el backend (solo para logging visible al operador). */
  renderedMessage?: string;
  /** Código de error normalizado (ver TwilioErrorCode). */
  errorCode?: TwilioErrorCode;
  /** Descripción humana del error. */
  errorMessage?: string;
}

export type TwilioErrorCode =
  | 'NOT_CONFIGURED'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'INVALID_PHONE'
  | 'INVALID_ORDER_STATE'
  | 'DUPLICATE'
  | 'RATE_LIMIT_PER_ORDER'
  | 'RATE_LIMIT_GLOBAL'
  | 'DAILY_BUDGET_EXCEEDED'
  | 'KILL_SWITCH_ON'
  | 'COOLDOWN_ACTIVE'
  | 'ALLOWLIST_BLOCKED'
  | 'NETWORK'
  | 'TWILIO_API_ERROR'
  | 'UNKNOWN';

/* ---------- Resultado del servicio (frontend) ---------- */

export interface SendSmsResult {
  ok: boolean;
  messageSid?: string;
  errorCode?: TwilioErrorCode;
  errorMessage?: string;
  /** Si true, no se llamó al backend (un guard local lo bloqueó). */
  blockedLocally?: boolean;
  /** Mensaje renderizado mostrado al operador (preview/auditoría). */
  renderedMessage?: string;
}

/* ---------- Registro persistente para cuotas ---------- */

/** Cada envío exitoso se registra para cuotas y dedup en cliente. */
export interface SmsSendRecord {
  orderId: string;
  templateType: NotificationEventType;
  /** Epoch ms del envío. */
  sentAt: number;
  /** SID devuelto por Twilio (si llegó). */
  messageSid?: string;
  /** Idempotency key usada. */
  idempotencyKey: string;
}
