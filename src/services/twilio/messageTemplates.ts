/**
 * Plantillas de mensajes SMS — SELLADAS.
 *
 * Reglas de oro:
 *   - El operador del backoffice NO puede editar el contenido del SMS.
 *   - El frontend solo las usa para PREVIEW; el mensaje real se renderiza en
 *     el backend con datos canónicos de Supabase, usando estas mismas
 *     plantillas (debe mantenerse paridad: ver TWILIO_SETUP.md).
 *   - Cualquier cambio aquí requiere PR + revisión.
 *
 * Limitaciones técnicas tenidas en cuenta:
 *   - SMS estándar GSM-7: 160 caracteres. UCS-2 (con tildes/emoji): 70.
 *   - Cada concatenación adicional cuenta como otro SMS facturable.
 *   - Mantenemos los textos cortos y SIN emoji para minimizar costo.
 */

import type { NotificationEventType } from '@/types/notifications';

export interface TemplateContext {
  customerName: string;
  orderNumber: string;
  trackingUrl: string;
  rackNumber?: string;
  daysReady?: number;
  estimatedDate?: string;
  estimatedDay?: string;
  storePhone?: string;
  reviewUrl?: string;
  /** Nombre comercial (configurable por entorno; default 'Ortega Cleaners'). */
  brandName?: string;
  /** Nota de novedad libre escrita por el operador (solo para ORDER_PROCESSED). */
  customNote?: string;
  /** Si true, omite la fecha estimada del mensaje (modo problema/avería). */
  omitEstimatedDate?: boolean;
}

const DEFAULT_BRAND = 'Ortega Cleaners';
const NO_REPLY_FOOTER = '\nNo-reply msg. Reply STOP to opt-out';

function brand(ctx: TemplateContext): string {
  return (ctx.brandName ?? DEFAULT_BRAND).trim() || DEFAULT_BRAND;
}

/**
 * Devuelve el texto SMS para el tipo de notificación.
 */
export function renderTemplate(type: NotificationEventType, ctx: TemplateContext): string {
  const estimatedDate = ctx.estimatedDate?.trim() || 'TBD';
  const estimatedDay = ctx.estimatedDay?.trim();
  const dayPrefix = estimatedDay ? `${estimatedDay}, ` : '';
  const storePhone = ctx.storePhone?.trim() || '(904) 666-0809';
  const reviewUrl = ctx.reviewUrl?.trim() || ctx.trackingUrl;

  let body = '';
  switch (type) {
    case 'ORDER_CREATED':
      body = `${brand(ctx)}: Hi ${ctx.customerName}, we got your order #${ctx.orderNumber}! Estimated ready: ${dayPrefix}${estimatedDate}. Track it here: ${ctx.trackingUrl}`;
      break;
    case 'ORDER_RECEIVED_TRACKING':
      body = `${brand(ctx)}: Hi ${ctx.customerName}! Your order is in, estimated ready by ${dayPrefix}${estimatedDate}. Track your order: ${ctx.trackingUrl}`;
      break;
    case 'ORDER_PROCESSED': {
      const note = ctx.customNote?.trim();
      if (note && ctx.omitEstimatedDate) {
        // Modo problema: hay novedad pero no hay fecha estimada
        body = `${brand(ctx)}: Hi ${ctx.customerName}, update on your order: ${note}. Please contact us to discuss next steps: ${ctx.trackingUrl}`;
      } else if (note) {
        // Hay novedad + fecha estimada
        body = `${brand(ctx)}: Hi ${ctx.customerName}, your order is being processed! Note: ${note}. Estimated ready: ${dayPrefix}${estimatedDate}. Track: ${ctx.trackingUrl}`;
      } else {
        // Base: sin novedad
        body = `${brand(ctx)}: Hi ${ctx.customerName}! Your order is being processed, estimated ready by ${dayPrefix}${estimatedDate}. Track: ${ctx.trackingUrl}`;
      }
      break;
    }
    case 'ORDER_DELAYED':
      body = `${brand(ctx)}: Hi, your order needs one more day. New ready date: ${dayPrefix}${estimatedDate}. Sorry for the wait! ${ctx.trackingUrl}`;
      break;
    case 'THANK_YOU_REVIEW':
      body = `Thanks for choosing ${brand(ctx)}, ${ctx.customerName}! We'd love your feedback: ${reviewUrl}`;
      break;
    case 'ORDER_READY':
      body = `Hi ${ctx.customerName}, your order is ready at ${brand(ctx)}! Stop by whenever works for you. Details: ${ctx.trackingUrl}`;
      break;
    case 'PICKUP_REMINDER':
      body = `${brand(ctx)}: Hi ${ctx.customerName}, your order has been ready for 3 days. Stop by whenever you can! ${ctx.trackingUrl}`;
      break;
    case 'URGENT_REMINDER':
      body = `Hi ${ctx.customerName}, your order has been ready for 5 days at ${brand(ctx)}. Stop by this week - need help? Call us at ${storePhone}. ${ctx.trackingUrl}`;
      break;
    case 'DAY_30_REMINDER':
      body = `Hi ${ctx.customerName}, your order has been ready for 30 days at ${brand(ctx)}. Please contact us to arrange pickup. ${ctx.trackingUrl}`;
      break;
    default:
      body = `${brand(ctx)}: Update on your order #${ctx.orderNumber}. ${ctx.trackingUrl}`;
      break;
  }

  return `${body}${NO_REPLY_FOOTER}`;
}

/** Caracteres extra fuera del rango ASCII que GSM-7 sí soporta (subset usado en ES). */
const GSM7_EXTRA = '¡¿áéíóúüñÁÉÍÓÚÜÑ';

/** Detecta caracteres no-GSM iterando por codepoint (evita regex con control chars). */
function hasNonGsmChar(message: string): boolean {
  for (let i = 0; i < message.length; i++) {
    const code = message.charCodeAt(i);
    if (code > 127 && !GSM7_EXTRA.includes(message[i])) return true;
  }
  return false;
}

/** Cuenta SMS facturables aproximada. Útil para mostrar al operador antes de enviar. */
export function estimateSmsSegments(message: string): number {
  // GSM-7: 160 chars en 1 SMS, 153 por segmento si concatenado.
  // UCS-2 (cualquier emoji o char fuera de GSM-7): 70 / 67.
  if (hasNonGsmChar(message)) {
    return message.length <= 70 ? 1 : Math.ceil(message.length / 67);
  }
  return message.length <= 160 ? 1 : Math.ceil(message.length / 153);
}
