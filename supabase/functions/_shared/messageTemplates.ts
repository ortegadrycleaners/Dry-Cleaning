/**
 * Plantillas SMS (paridad con src/services/twilio/messageTemplates.ts).
 * El backend renderiza el mensaje real; el frontend solo hace preview.
 */

export type TemplateType =
  | 'ORDER_CREATED'
  | 'ORDER_RECEIVED_TRACKING'
  | 'ORDER_DELAYED'
  | 'THANK_YOU_REVIEW'
  | 'ORDER_READY'
  | 'PICKUP_REMINDER'
  | 'URGENT_REMINDER'
  | 'DAY_30_REMINDER';

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
  brandName?: string;
}

const DEFAULT_BRAND = 'Ortega Dry Cleaners';

function brand(ctx: TemplateContext): string {
  return (ctx.brandName ?? DEFAULT_BRAND).trim() || DEFAULT_BRAND;
}

/** Renderiza el texto SMS para el tipo indicado. */
export function renderTemplate(type: TemplateType, ctx: TemplateContext): string {
  const estimatedDate = ctx.estimatedDate?.trim() || 'TBD';
  const estimatedDay = ctx.estimatedDay?.trim();
  const dayPrefix = estimatedDay ? `${estimatedDay}, ` : '';
  const storePhone = ctx.storePhone?.trim() || 'N/A';
  const reviewUrl = ctx.reviewUrl?.trim() || ctx.trackingUrl;

  switch (type) {
    case 'ORDER_CREATED': {
      const fecha = ctx.estimatedDate ? ` Lista aprox: ${ctx.estimatedDate}.` : '';
      return `${brand(ctx)}: Hola ${ctx.customerName}, recibimos tu orden #${ctx.orderNumber}.${fecha} Sigue: ${ctx.trackingUrl}`;
    }
    case 'ORDER_RECEIVED_TRACKING':
      return `${brand(ctx)}: We received your order, ${ctx.customerName}! Estimated ready by ${dayPrefix}${estimatedDate}. Track your order: ${ctx.trackingUrl}`;
    case 'ORDER_DELAYED':
      return `${brand(ctx)}: Your order needs one more day. New ready date: ${dayPrefix}${estimatedDate}. Sorry for the delay. ${ctx.trackingUrl}`;
    case 'THANK_YOU_REVIEW':
      return `Thanks for trusting ${brand(ctx)}, ${ctx.customerName}! How did we do? Your feedback helps us a lot: ${reviewUrl}`;
    case 'ORDER_READY':
      return `Hi ${ctx.customerName}, your order is ready at ${brand(ctx)}. Stop by whenever works for you. Details: ${ctx.trackingUrl}`;
    case 'PICKUP_REMINDER':
      return `${brand(ctx)}: Hi ${ctx.customerName}, your order has been waiting for 3 days. Stop by whenever you can: ${ctx.trackingUrl}`;
    case 'URGENT_REMINDER':
      return `Hi ${ctx.customerName}, your order has been ready for 5 days at ${brand(ctx)}. Stop by this week - if you need anything, call us at ${storePhone}. ${ctx.trackingUrl}`;
    case 'DAY_30_REMINDER':
      return `Hi ${ctx.customerName}, your order has been ready for 30 days at ${brand(ctx)}. Please contact us to arrange pickup. ${ctx.trackingUrl}`;
    default:
      return `${brand(ctx)}: Notificacion de tu orden #${ctx.orderNumber}. ${ctx.trackingUrl}`;
  }
}
