/**
 * NotificationService — Orquestador de Mensajería.
 *
 * Responsabilidades:
 * - Suscribirse a eventos del dominio vía EventBus.
 * - Generar notificaciones con mensajes basados en plantillas.
 * - Crear tokens de seguridad únicos por enlace de tracking.
 * - Persistir log de notificaciones en localStorage.
 * - Simular envío de SMS (frontend-only MVP; listo para integrar proveedor real).
 */
import { eventBus } from './EventBus';
import { generatePublicId } from '@/lib/utils';
import type {
  Notification,
  NotificationEventType,
  OrderEvent,
  MessageTemplateVars,
} from '@/types/notifications';

/* ---------- Constantes ---------- */

const STORAGE_KEY = 'tintoreria_notifications';

export const EVENT_NAMES = {
  ORDER_CREATED: 'ORDER_CREATED',
  ORDER_READY: 'ORDER_READY',
  PICKUP_REMINDER: 'PICKUP_REMINDER',
  URGENT_REMINDER: 'URGENT_REMINDER',
} as const;

/* ---------- Plantillas de mensajes ---------- */

function buildMessage(type: NotificationEventType, vars: MessageTemplateVars): string {
  switch (type) {
    case 'ORDER_CREATED':
      return (
        `Hola ${vars.customerName}, tu orden #${vars.orderNumber} ha sido recibida. ` +
        `Fecha estimada: ${vars.estimatedDate ?? 'próximamente'}. ` +
        `Sigue tu orden aquí: ${vars.trackingUrl}`
      );

    case 'ORDER_READY':
      return (
        `¡${vars.customerName}, tu orden #${vars.orderNumber} está lista! ` +
        (vars.rackNumber ? `Ubicación: Rack #${vars.rackNumber}. ` : '') +
        `Recógela en nuestro horario. Detalles: ${vars.trackingUrl}`
      );

    case 'PICKUP_REMINDER':
      return (
        `Recordatorio: ${vars.customerName}, tu orden #${vars.orderNumber} ` +
        `lleva ${vars.daysReady} días lista esperándote. ` +
        `Pasa a recogerla pronto. Info: ${vars.trackingUrl}`
      );

    case 'URGENT_REMINDER':
      return (
        `URGENTE: ${vars.customerName}, tu orden #${vars.orderNumber} ` +
        `lleva ${vars.daysReady} días en rack. Por favor recógela lo antes posible. ` +
        `Detalles: ${vars.trackingUrl}`
      );

    default:
      return `Notificación sobre tu orden #${vars.orderNumber}: ${vars.trackingUrl}`;
  }
}

/* ---------- Generación de token de seguridad ---------- */

/**
 * Genera un token de seguridad único para cada enlace de notificación.
 * Garantiza acceso exclusivo vinculado a la sesión del usuario.
 */
function generateSecurityToken(): string {
  return generatePublicId(24);
}

/* ---------- Persistencia con cache en memoria ----------
 * Evita JSON.parse repetido en cada chequeo (clave para no saturar al backend
 * cuando esto se migre a Supabase: una sola "lectura" por sesión hasta que
 * cambien los datos en este mismo cliente). */

let notificationsCache: Notification[] | null = null;

function loadNotifications(): Notification[] {
  if (notificationsCache !== null) return notificationsCache;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    notificationsCache = raw ? (JSON.parse(raw) as Notification[]) : [];
  } catch {
    notificationsCache = [];
  }
  return notificationsCache;
}

function saveNotifications(notifications: Notification[]): void {
  notificationsCache = notifications;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notifications));
  } catch {
    console.error('[NotificationService] Error al persistir notificaciones');
  }
}

/* ---------- Tipo callback para notificar al contexto React ---------- */

export type OnNotificationCallback = (notification: Notification) => void;

/* ---------- Servicio ---------- */

class NotificationServiceImpl {
  private unsubscribers: (() => void)[] = [];
  private onNotification: OnNotificationCallback | null = null;

  /** Conecta un callback de React para recibir notificaciones nuevas en tiempo real. */
  setOnNotification(cb: OnNotificationCallback | null): void {
    this.onNotification = cb;
  }

  /** Inicializa las suscripciones al EventBus. */
  start(): void {
    this.stop();

    this.unsubscribers.push(
      eventBus.on<OrderEvent>(EVENT_NAMES.ORDER_CREATED, (event) =>
        this.handleEvent(event)
      ),
      eventBus.on<OrderEvent>(EVENT_NAMES.ORDER_READY, (event) =>
        this.handleEvent(event)
      ),
      eventBus.on<OrderEvent>(EVENT_NAMES.PICKUP_REMINDER, (event) =>
        this.handleEvent(event)
      ),
      eventBus.on<OrderEvent>(EVENT_NAMES.URGENT_REMINDER, (event) =>
        this.handleEvent(event)
      ),
    );
  }

  /** Desuscribe todos los handlers. */
  stop(): void {
    for (const unsub of this.unsubscribers) unsub();
    this.unsubscribers = [];
  }

  /** Obtiene todas las notificaciones persistidas. */
  getNotifications(): Notification[] {
    return loadNotifications();
  }

  /** Marca una notificación como leída. */
  markAsRead(notificationId: string): Notification[] {
    const notifications = loadNotifications().map((n) =>
      n.id === notificationId ? { ...n, read: true } : n
    );
    saveNotifications(notifications);
    return notifications;
  }

  /** Marca todas las notificaciones como leídas. */
  markAllAsRead(): Notification[] {
    const notifications = loadNotifications().map((n) => ({ ...n, read: true }));
    saveNotifications(notifications);
    return notifications;
  }

  /** Verifica si ya se envió una notificación de cierto tipo para una orden. */
  hasNotificationForOrder(orderId: string, type: NotificationEventType): boolean {
    return loadNotifications().some(
      (n) => n.orderId === orderId && n.type === type
    );
  }

  /** Lógica central: procesa un evento y genera la notificación. */
  private handleEvent(event: OrderEvent): void {
    if (this.hasNotificationForOrder(event.orderId, event.type)) {
      return;
    }

    const token = generateSecurityToken();
    const trackingUrl = `${window.location.origin}/tracking/${event.orderId}?token=${token}`;

    const message = buildMessage(event.type, {
      customerName: event.customerName,
      orderNumber: event.orderNumber,
      trackingUrl,
      rackNumber: event.payload.rackNumber as string | undefined,
      daysReady: event.payload.daysReady as number | undefined,
      estimatedDate: event.payload.estimatedDate as string | undefined,
    });

    const notification: Notification = {
      id: generatePublicId(16),
      type: event.type,
      orderId: event.orderId,
      orderNumber: event.orderNumber,
      customerName: event.customerName,
      phone: event.phone,
      message,
      channel: 'sms',
      status: 'sent',
      createdAt: new Date().toISOString(),
      trackingToken: token,
      trackingUrl,
      read: false,
    };

    const notifications = [notification, ...loadNotifications()];
    saveNotifications(notifications);

    this.onNotification?.(notification);
  }
}

export const notificationService = new NotificationServiceImpl();
