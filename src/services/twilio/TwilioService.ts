/**
 * TwilioService (frontend) — Orquesta el envío de SMS desde el backoffice.
 *
 * Responsabilidades:
 *   - Resolver el cliente desde la fuente canónica (Supabase / fallback Order).
 *   - Generar idempotency key estable (orderId + tipo + día).
 *   - Ejecutar TODAS las guards locales de protección.
 *   - Invocar el endpoint backend que custodia las credenciales de Twilio.
 *   - Registrar el envío para dedup y cuotas.
 *   - Emitir el evento ORDER_READY al EventBus para mantener el log in-app.
 *
 * NO contiene (intencionalmente) Account SID ni Auth Token: esos viven en el
 * backend (Supabase Edge Function o API propia). Ver TWILIO_SETUP.md.
 */

import type { Order } from '@/types';
import type { NotificationEventType, OrderEvent } from '@/types/notifications';
import { eventBus } from '@/services/EventBus';
import { EVENT_NAMES } from '@/services/NotificationService';
import { getCustomerForOrder } from '@/services/supabase/customerSource';
import { getTwilioConfig } from './config';
import { recordSmsSent, runAllGuards, type GuardResult } from './protections';
import { renderTemplate, type TemplateContext } from './messageTemplates';
import type {
  NotifySmsRequest,
  NotifySmsResponse,
  SendSmsResult,
  SmsSendRecord,
  TwilioErrorCode,
} from './types';

/* ---------- Idempotency key ---------- */

/**
 * Idempotency key estable por (orderId + type + día UTC).
 *
 * Permite que reintentos accidentales del mismo día no se conviertan en SMS
 * duplicados en Twilio: el backend usa esta key como índice único en su
 * tabla de envíos.
 */
function buildIdempotencyKey(orderId: string, type: NotificationEventType): string {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  return `${orderId}:${type}:${today}`;
}

/* ---------- Tracking URL ---------- */

function resolveTrackingId(order: Pick<Order, 'id' | 'publicId'>): string {
  return order.publicId?.trim() || order.id;
}

function buildTrackingUrl(order: Pick<Order, 'id' | 'publicId'>): string {
  // El token real lo genera el backend al persistir la notificación; el
  // frontend solo arma una URL de preview a la página de tracking.
  return `${window.location.origin}/tracking/${resolveTrackingId(order)}`;
}

/* ---------- Preview de mensaje ---------- */

export function previewMessage(order: Order, type: NotificationEventType): string {
  const ctx: TemplateContext = {
    customerName: order.customerName,
    orderNumber: order.orderNumber,
    trackingUrl: buildTrackingUrl(order),
    rackNumber: order.rackNumber,
    daysReady: order.daysReady,
    estimatedDate: order.estimatedDate,
  };
  return renderTemplate(type, ctx);
}

/* ---------- Llamada al backend ---------- */

const NETWORK_TIMEOUT_MS = 15_000;

async function callBackend(req: NotifySmsRequest): Promise<NotifySmsResponse> {
  const cfg = getTwilioConfig();

  if (cfg.mockMode) {
    // Mock determinista: simula 200ms de latencia y devuelve éxito.
    await new Promise((r) => setTimeout(r, 200));
    return {
      ok: true,
      messageSid: `MOCK_${req.idempotencyKey}`,
      status: 'queued',
    };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), NETWORK_TIMEOUT_MS);

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Idempotency-Key': req.idempotencyKey,
    };
    if (cfg.endpointKey) {
      headers['Authorization'] = `Bearer ${cfg.endpointKey}`;
    }

    const res = await fetch(cfg.endpointUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(req),
      signal: controller.signal,
      credentials: 'include',
    });

    if (!res.ok) {
      const status = res.status;
      let errorMessage = `HTTP ${status}`;
      let errorCode: TwilioErrorCode = 'TWILIO_API_ERROR';
      if (status === 401 || status === 403) errorCode = status === 401 ? 'UNAUTHENTICATED' : 'FORBIDDEN';
      try {
        const body = (await res.json()) as Partial<NotifySmsResponse>;
        errorMessage = body.errorMessage ?? errorMessage;
        errorCode = body.errorCode ?? errorCode;
      } catch {
        /* respuesta no JSON */
      }
      return { ok: false, errorCode, errorMessage };
    }

    const body = (await res.json()) as NotifySmsResponse;
    return body;
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return { ok: false, errorCode: 'NETWORK', errorMessage: 'Timeout llamando al servicio de SMS.' };
    }
    return {
      ok: false,
      errorCode: 'NETWORK',
      errorMessage: err instanceof Error ? err.message : 'Error de red desconocido.',
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

/* ---------- API pública: notificar orden lista ---------- */

export interface NotifyOrderReadyArgs {
  order: Order;
  /** Identificador del operador autenticado (para auditoría). */
  operatorId: string;
}

export interface NotifyPickupReminderArgs {
  order: Order;
  /** Identificador del operador autenticado (para auditoría). */
  operatorId: string;
  /** Días desde que la orden quedó LISTA (derivado de statusUpdatedAt). */
  daysReady?: number | null;
}

interface NotifySmsArgs {
  order: Order;
  operatorId: string;
  type: NotificationEventType;
  daysReady?: number | null;
}

function eventNameForType(type: NotificationEventType): keyof typeof EVENT_NAMES {
  switch (type) {
    case 'ORDER_CREATED':
      return 'ORDER_CREATED';
    case 'PICKUP_REMINDER':
      return 'PICKUP_REMINDER';
    case 'URGENT_REMINDER':
      return 'URGENT_REMINDER';
    default:
      return 'ORDER_READY';
  }
}

/**
 * Único punto que dispara un SMS a Twilio para una orden LISTA.
 *
 * Garantiza:
 *   - Que TODAS las protecciones locales se ejecutaron antes de salir a red.
 *   - Que se usa idempotency key (no se duplican cargos por reintentos).
 *   - Que el envío exitoso queda registrado para dedup local y cuotas.
 *   - Que se emite `ORDER_READY` al EventBus solo si Twilio confirmó éxito,
 *     manteniendo coherente el log in-app.
 */
export async function notifyOrderReady({
  order,
  operatorId,
}: NotifyOrderReadyArgs): Promise<SendSmsResult> {
  return notifySms({ order, operatorId, type: 'ORDER_READY' });
}

export async function notifyPickupReminder({
  order,
  operatorId,
  daysReady,
}: NotifyPickupReminderArgs): Promise<SendSmsResult> {
  return notifySms({ order, operatorId, type: 'PICKUP_REMINDER', daysReady });
}

async function notifySms({
  order,
  operatorId,
  type,
  daysReady,
}: NotifySmsArgs): Promise<SendSmsResult> {
  const guard: GuardResult = runAllGuards(order, type);
  if (!guard.ok) {
    return {
      ok: false,
      errorCode: guard.errorCode,
      errorMessage: guard.errorMessage,
      blockedLocally: true,
    };
  }

  // Resolver datos canónicos del cliente (placeholder Supabase). Si Supabase
  // no está configurado, cae a los datos de la orden — el backend igual hará
  // la verificación contra su propia copia.
  const customer = await getCustomerForOrder(order.id);
  const customerName = customer?.name?.trim() || order.customerName;

  const ctx: TemplateContext = {
    customerName,
    orderNumber: order.orderNumber,
    trackingUrl: buildTrackingUrl(order),
    rackNumber: order.rackNumber,
    daysReady: typeof daysReady === 'number' ? daysReady : order.daysReady,
    estimatedDate: order.estimatedDate,
  };
  const renderedMessage = renderTemplate(type, ctx);

  const idempotencyKey = buildIdempotencyKey(order.id, type);
  const request: NotifySmsRequest = {
    orderId: order.id,
    templateType: type,
    idempotencyKey,
    operatorId,
  };

  const response = await callBackend(request);

  if (!response.ok) {
    return {
      ok: false,
      errorCode: response.errorCode ?? 'UNKNOWN',
      errorMessage: response.errorMessage ?? 'No se pudo enviar el SMS.',
      blockedLocally: false,
      renderedMessage,
    };
  }

  const sentAt = Date.now();
  const record: SmsSendRecord = {
    orderId: order.id,
    templateType: type,
    sentAt,
    messageSid: response.messageSid,
    idempotencyKey,
  };
  recordSmsSent(record);

  // Sincroniza el log in-app SOLO tras éxito real, evitando registrar SMS
  // que en realidad nunca salieron.
  const event: OrderEvent = {
    type,
    orderId: order.id,
    orderNumber: order.orderNumber,
    customerName,
    phone: order.phone,
    timestamp: new Date(sentAt).toISOString(),
    payload: {
      rackNumber: order.rackNumber,
      daysReady: typeof daysReady === 'number' ? daysReady : order.daysReady,
    },
  };
  queueMicrotask(() => eventBus.emit(EVENT_NAMES[eventNameForType(type)], event));

  return {
    ok: true,
    messageSid: response.messageSid,
    renderedMessage: response.renderedMessage ?? renderedMessage,
  };
}
