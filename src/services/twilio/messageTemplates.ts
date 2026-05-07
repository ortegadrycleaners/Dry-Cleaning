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
  /** Nombre comercial (configurable por entorno; default 'Tintoreria'). */
  brandName?: string;
}

const DEFAULT_BRAND = 'Tintoreria';

function brand(ctx: TemplateContext): string {
  return (ctx.brandName ?? DEFAULT_BRAND).trim() || DEFAULT_BRAND;
}

/**
 * Devuelve el texto SMS para el tipo de notificación.
 *
 * Diseñadas para caber en 1 SMS GSM-7 (≤160 chars) en el caso típico.
 */
export function renderTemplate(type: NotificationEventType, ctx: TemplateContext): string {
  switch (type) {
    case 'ORDER_CREATED': {
      const fecha = ctx.estimatedDate ? ` Lista aprox: ${ctx.estimatedDate}.` : '';
      return `${brand(ctx)}: Hola ${ctx.customerName}, recibimos tu orden #${ctx.orderNumber}.${fecha} Sigue: ${ctx.trackingUrl}`;
    }
    case 'ORDER_READY': {
      const rack = ctx.rackNumber ? ` Rack #${ctx.rackNumber}.` : '';
      return `${brand(ctx)}: ${ctx.customerName}, tu orden #${ctx.orderNumber} esta lista para recoger.${rack} Detalle: ${ctx.trackingUrl}`;
    }
    case 'PICKUP_REMINDER': {
      const dias = ctx.daysReady ?? 0;
      return `${brand(ctx)}: Recordatorio. Tu orden #${ctx.orderNumber} lleva ${dias} dias lista. Pasa a recogerla. ${ctx.trackingUrl}`;
    }
    case 'URGENT_REMINDER': {
      const dias = ctx.daysReady ?? 0;
      return `${brand(ctx)}: URGENTE ${ctx.customerName}, tu orden #${ctx.orderNumber} lleva ${dias} dias en rack. Recogela pronto. ${ctx.trackingUrl}`;
    }
    default:
      return `${brand(ctx)}: Notificacion de tu orden #${ctx.orderNumber}. ${ctx.trackingUrl}`;
  }
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
