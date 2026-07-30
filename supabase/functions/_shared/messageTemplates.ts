/**
 * Plantillas SMS (paridad con src/services/twilio/messageTemplates.ts).
 * El backend renderiza el mensaje real; el frontend solo hace preview.
 */

export type TemplateType =
  | 'ORDER_CREATED'
  | 'ORDER_RECEIVED_TRACKING'
  | 'ORDER_PROCESSED'
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
  /** Nota de novedad libre escrita por el operador (solo para ORDER_PROCESSED). */
  customNote?: string;
  /** Si true, omite la fecha estimada (modo problema/avería). */
  omitEstimatedDate?: boolean;
}

const DEFAULT_BRAND = 'Ortega Cleaners';

function brand(ctx: TemplateContext): string {
  return (ctx.brandName ?? DEFAULT_BRAND).trim() || DEFAULT_BRAND;
}

/** Renderiza el texto SMS para el tipo indicado. */
export function renderTemplate(type: TemplateType, ctx: TemplateContext): string {
  const estimatedDate = ctx.estimatedDate?.trim() || 'TBD';
  const estimatedDay = ctx.estimatedDay?.trim();
  const dayPrefix = estimatedDay ? `${estimatedDay}, ` : '';
  const storePhone = ctx.storePhone?.trim() || '(904) 666-0809';
  const reviewUrl = ctx.reviewUrl?.trim() || ctx.trackingUrl;

  switch (type) {
    case 'ORDER_CREATED':
      return `${brand(ctx)}: Hi ${ctx.customerName}, we got your order #${ctx.orderNumber}! Estimated ready: ${dayPrefix}${estimatedDate}. Track it here: ${ctx.trackingUrl}`;
    case 'ORDER_RECEIVED_TRACKING':
      return `${brand(ctx)}: Hi ${ctx.customerName}! Your order is in, estimated ready by ${dayPrefix}${estimatedDate}. Track your order: ${ctx.trackingUrl}`;
    case 'ORDER_PROCESSED': {
      const note = ctx.customNote?.trim();
      if (note && ctx.omitEstimatedDate) {
        return `${brand(ctx)}: Hi ${ctx.customerName}, update on your order: ${note}. Please contact us to discuss next steps: ${ctx.trackingUrl}`;
      }
      if (note) {
        return `${brand(ctx)}: Hi ${ctx.customerName}, your order is being processed! Note: ${note}. Estimated ready: ${dayPrefix}${estimatedDate}. Track: ${ctx.trackingUrl}`;
      }
      return `${brand(ctx)}: Hi ${ctx.customerName}! Your order is being processed, estimated ready by ${dayPrefix}${estimatedDate}. Track: ${ctx.trackingUrl}`;
    }
    case 'ORDER_DELAYED':
      return `${brand(ctx)}: Hi, your order needs one more day. New ready date: ${dayPrefix}${estimatedDate}. Sorry for the wait! ${ctx.trackingUrl}`;
    case 'THANK_YOU_REVIEW':
      return `Thanks for choosing ${brand(ctx)}, ${ctx.customerName}! We'd love your feedback: ${reviewUrl}`;
    case 'ORDER_READY':
      return `Hi ${ctx.customerName}, your order is ready at ${brand(ctx)}! Stop by whenever works for you. Details: ${ctx.trackingUrl}`;
    case 'PICKUP_REMINDER':
      return `${brand(ctx)}: Hi ${ctx.customerName}, your order has been ready for 3 days. Stop by whenever you can! ${ctx.trackingUrl}`;
    case 'URGENT_REMINDER':
      return `Hi ${ctx.customerName}, your order has been ready for 5 days at ${brand(ctx)}. Stop by this week - need help? Call us at ${storePhone}. ${ctx.trackingUrl}`;
    case 'DAY_30_REMINDER':
      return `Hi ${ctx.customerName}, your order has been ready for 30 days at ${brand(ctx)}. Please contact us to arrange pickup. ${ctx.trackingUrl}`;
    default:
      return `${brand(ctx)}: Update on your order #${ctx.orderNumber}. ${ctx.trackingUrl}`;
  }
}

