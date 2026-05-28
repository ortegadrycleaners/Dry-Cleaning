/**
 * Tipos del Sistema de Orquestación de Mensajería.
 *
 * Define los contratos para eventos, notificaciones y configuración
 * del sistema de notificaciones dirigido por eventos.
 */

/* ---------- Eventos del dominio ---------- */

export type NotificationEventType =
  | 'ORDER_CREATED'
  | 'ORDER_RECEIVED_TRACKING'
  | 'ORDER_DELAYED'
  | 'THANK_YOU_REVIEW'
  | 'ORDER_READY'
  | 'PICKUP_REMINDER'
  | 'URGENT_REMINDER'
  | 'DAY_30_REMINDER';

export interface OrderEvent {
  type: NotificationEventType;
  orderId: string;
  orderNumber: string;
  customerName: string;
  phone: string;
  timestamp: string;
  payload: Record<string, unknown>;
}

/* ---------- Notificaciones ---------- */

export type NotificationChannel = 'sms' | 'in-app';
export type NotificationStatus = 'pending' | 'sent' | 'failed';

export interface Notification {
  id: string;
  type: NotificationEventType;
  orderId: string;
  orderNumber: string;
  customerName: string;
  phone: string;
  message: string;
  channel: NotificationChannel;
  status: NotificationStatus;
  createdAt: string;
  trackingToken: string;
  trackingUrl: string;
  read: boolean;
}

/* ---------- Configuración de recordatorios ---------- */

export interface ReminderConfig {
  /** Días después de LISTO para enviar primer recordatorio. */
  firstReminderDays: number;
  /** Días después de LISTO para enviar recordatorio urgente. */
  urgentReminderDays: number;
  /** Intervalo en ms para verificar órdenes pendientes de recordatorio. */
  checkIntervalMs: number;
}

export const DEFAULT_REMINDER_CONFIG: ReminderConfig = {
  firstReminderDays: 3,
  urgentReminderDays: 5,
  // 5 min: balance entre responsividad y consumo. Con Supabase gratuito esto
  // implica ~12 chequeos/hora por usuario activo en lugar de 60.
  checkIntervalMs: 300_000,
};

/* ---------- Plantillas de mensajes ---------- */

export interface MessageTemplate {
  type: NotificationEventType;
  template: (vars: MessageTemplateVars) => string;
}

export interface MessageTemplateVars {
  customerName: string;
  orderNumber: string;
  trackingUrl: string;
  rackNumber?: string;
  daysReady?: number;
  estimatedDate?: string;
  estimatedDay?: string;
  storePhone?: string;
  reviewUrl?: string;
}

export interface NotificationTemplateOption {
  type: NotificationEventType;
  label: string;
  description?: string;
}

export const NOTIFICATION_TEMPLATE_OPTIONS: NotificationTemplateOption[] = [
  { type: 'ORDER_RECEIVED_TRACKING', label: 'Order received + tracking' },
  { type: 'ORDER_READY', label: 'Order ready' },
  { type: 'ORDER_DELAYED', label: 'Order delayed' },
  { type: 'THANK_YOU_REVIEW', label: 'Thanks + Google review' },
  { type: 'PICKUP_REMINDER', label: 'Not picked up - day 3' },
  { type: 'URGENT_REMINDER', label: 'Follow up order - day 5' },
  { type: 'DAY_30_REMINDER', label: 'Follow up order - day 30' },
];
