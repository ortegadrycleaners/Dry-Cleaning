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
import { supabase } from '@/lib/supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type {
  Notification,
  NotificationEventType,
  NotificationStatus,
  OrderEvent,
  MessageTemplateVars,
} from '@/types/notifications';

/* ---------- Constantes ---------- */

const STORAGE_KEY = 'tintoreria_notifications';

export const EVENT_NAMES = {
  ORDER_CREATED: 'ORDER_CREATED',
  ORDER_RECEIVED_TRACKING: 'ORDER_RECEIVED_TRACKING',
  ORDER_DELAYED: 'ORDER_DELAYED',
  THANK_YOU_REVIEW: 'THANK_YOU_REVIEW',
  ORDER_READY: 'ORDER_READY',
  PICKUP_REMINDER: 'PICKUP_REMINDER',
  URGENT_REMINDER: 'URGENT_REMINDER',
  DAY_30_REMINDER: 'DAY_30_REMINDER',
} as const;

/* ---------- Plantillas de mensajes ---------- */

function buildMessage(type: NotificationEventType, vars: MessageTemplateVars): string {
  const brand = 'Ortega Cleaners';
  const estimatedDate = vars.estimatedDate?.trim() || 'TBD';
  const estimatedDay = vars.estimatedDay?.trim();
  const dayPrefix = estimatedDay ? `${estimatedDay}, ` : '';
  const storePhone = '(904) 666-0809';
  const reviewUrl = vars.reviewUrl?.trim() || vars.trackingUrl;

  switch (type) {
    case 'ORDER_CREATED':
      return `${brand}: Hi ${vars.customerName}, we got your order #${vars.orderNumber}! Estimated ready: ${dayPrefix}${estimatedDate}. Track it here: ${vars.trackingUrl}`;

    case 'ORDER_RECEIVED_TRACKING':
      return `${brand}: Hi ${vars.customerName}! Your order is in, estimated ready by ${dayPrefix}${estimatedDate}. Track your order: ${vars.trackingUrl}`;

    case 'ORDER_DELAYED':
      return `${brand}: Hi, your order needs one more day. New ready date: ${dayPrefix}${estimatedDate}. Sorry for the wait! ${vars.trackingUrl}`;

    case 'THANK_YOU_REVIEW':
      return `Thanks for choosing ${brand}, ${vars.customerName}! We'd love your feedback: ${reviewUrl}`;

    case 'ORDER_READY':
      return `Hi ${vars.customerName}, your order is ready at ${brand}! Stop by whenever works for you. Details: ${vars.trackingUrl}`;

    case 'PICKUP_REMINDER':
      return `${brand}: Hi ${vars.customerName}, your order has been ready for 3 days. Stop by whenever you can! ${vars.trackingUrl}`;

    case 'URGENT_REMINDER':
      return `Hi ${vars.customerName}, your order has been ready for 5 days at ${brand}. Stop by this week - need help? Call us at ${storePhone}. ${vars.trackingUrl}`;

    case 'DAY_30_REMINDER':
      return `Hi ${vars.customerName}, your order has been ready for 30 days at ${brand}. Please contact us to arrange pickup. ${vars.trackingUrl}`;

    default:
      return `${brand}: Update on your order #${vars.orderNumber}. ${vars.trackingUrl}`;
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

type NotificationRow = {
  id?: string;
  receipt_id?: string;
  notification_type?: string;
  order_number?: string;
  customer_name?: string;
  phone?: string;
  message?: string;
  created_at?: string;
  read?: boolean;
  status?: string;
  metadata?: { trackingToken?: string; trackingUrl?: string };
};

/** DB usa 'claimed' mientras el envío está en curso; el resto del código usa 'pending'. */
function mapDbStatus(status: string | undefined): NotificationStatus {
  if (status === 'sent' || status === 'failed') return status;
  return 'pending';
}

/* ---------- Servicio ---------- */

class NotificationServiceImpl {
  private unsubscribers: (() => void)[] = [];
  private onNotification: OnNotificationCallback | null = null;
  private supabaseChannel: RealtimeChannel | null = null;

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
      eventBus.on<OrderEvent>(EVENT_NAMES.ORDER_RECEIVED_TRACKING, (event) =>
        this.handleEvent(event)
      ),
      eventBus.on<OrderEvent>(EVENT_NAMES.ORDER_DELAYED, (event) =>
        this.handleEvent(event)
      ),
      eventBus.on<OrderEvent>(EVENT_NAMES.THANK_YOU_REVIEW, (event) =>
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
      eventBus.on<OrderEvent>(EVENT_NAMES.DAY_30_REMINDER, (event) =>
        this.handleEvent(event)
      ),
    );

    // Initialize Supabase realtime subscription and initial load
    this.initSupabaseNotifications().catch((err) => {
      console.error('[NotificationService] Supabase init error', err);
    });
  }

  /** Desuscribe todos los handlers. */
  stop(): void {
    for (const unsub of this.unsubscribers) unsub();
    this.unsubscribers = [];
    if (this.supabaseChannel) {
      try {
        void supabase.removeChannel(this.supabaseChannel);
      } catch {
        // Channel may already be closed
      }
      this.supabaseChannel = null;
    }
  }

  /** Inicializa suscripción realtime y carga inicial desde la tabla `receipt_notification`. */
  private async initSupabaseNotifications(): Promise<void> {
    // Load recent notifications once
    try {
      const { data, error } = await supabase
        .from('receipt_notification')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;

      if (Array.isArray(data)) {
        const list = data.map((row) => this.mapRowToNotification(row as NotificationRow));
        // merge with existing local cache but prefer DB entries first
        const existing = loadNotifications();
        const merged = [...list, ...existing.filter(e => !list.some(l => l.id === e.id))];
        saveNotifications(merged);
      }
    } catch (err) {
      console.warn('[NotificationService] could not load initial notifications', err);
    }

    // Subscribe to inserts + updates on receipt_notification. Rows are
    // inserted with status='claimed' before the SMS send is attempted and
    // later updated to 'sent'/'failed' once the real Twilio outcome is known
    // (see markReminderNotificationResult in supabase/functions/_shared/guards.ts).
    try {
      // Supabase v2 channel
      const ch = supabase.channel(`public:receipt_notification:${Date.now()}`);
      ch.on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'receipt_notification' },
        (payload: { record?: NotificationRow; new?: NotificationRow }) => {
          const row = payload.record ?? payload.new;
          if (!row) return;
          const notification = this.mapRowToNotification(row);
          const notifications = [notification, ...loadNotifications()];
          saveNotifications(notifications);
          this.onNotification?.(notification);
        }
      );
      ch.on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'receipt_notification' },
        (payload: { record?: NotificationRow; new?: NotificationRow }) => {
          const row = payload.record ?? payload.new;
          if (!row?.id) return;
          const updated = this.mapRowToNotification(row);
          const notifications = loadNotifications().map((n) => (n.id === updated.id ? { ...n, ...updated, read: n.read } : n));
          saveNotifications(notifications);
        }
      );
      await ch.subscribe();
      this.supabaseChannel = ch;
    } catch (err) {
      console.warn('[NotificationService] failed to subscribe to Supabase realtime', err);
    }
  }



  private mapRowToNotification(row: NotificationRow): Notification {
    const metadata = row.metadata ?? {};
    const trackingToken = metadata.trackingToken ?? '';
    const trackingUrl = metadata.trackingUrl ?? `${window.location.origin}/tracking/${row.receipt_id}?token=${trackingToken}`;

    return {
      id: (row.id as string) ?? generatePublicId(16),
      type: (row.notification_type as NotificationEventType) ?? 'ORDER_READY',
      orderId: (row.receipt_id as string) ?? '',
      orderNumber: (row.order_number as string) ?? '',
      customerName: (row.customer_name as string) ?? '',
      phone: (row.phone as string) ?? '',
      message: (row.message as string) ?? '',
      channel: 'sms',
      status: mapDbStatus(row.status),
      createdAt: (row.created_at as string) ?? new Date().toISOString(),
      trackingToken,
      trackingUrl,
      read: !!row.read,
    } as Notification;
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
      estimatedDay: event.payload.estimatedDay as string | undefined,
      reviewUrl: event.payload.reviewUrl as string | undefined,
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
