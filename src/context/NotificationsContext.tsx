/**
 * NotificationsContext — Estado reactivo de notificaciones para React.
 *
 * Conecta el NotificationService (imperativo) con el ciclo de vida de React,
 * incluyendo la lógica de recordatorios programados que verifica periódicamente
 * las órdenes LISTO con intervalos parametrizables (3 y 5 días).
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { toast } from 'sonner';
import { notificationService, EVENT_NAMES } from '@/services/NotificationService';
import { eventBus } from '@/services/EventBus';
import { useOrders } from '@/context/OrdersContext';
import type { Notification, ReminderConfig, OrderEvent } from '@/types/notifications';
import { DEFAULT_REMINDER_CONFIG } from '@/types/notifications';

/* eslint-disable react-refresh/only-export-components */

interface NotificationsContextType {
  notifications: Notification[];
  unreadCount: number;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  reminderConfig: ReminderConfig;
}

const NotificationsContext = createContext<NotificationsContextType | undefined>(undefined);

/** Muestra un toast visual según el tipo de notificación. */
function showToast(notification: Notification): void {
  const titles: Record<string, string> = {
    ORDER_CREATED: 'Orden Confirmada',
    ORDER_READY: 'Orden Lista',
    PICKUP_REMINDER: 'Recordatorio',
    URGENT_REMINDER: 'Recordatorio Urgente',
  };

  const title = titles[notification.type] ?? 'Notificación';
  const description = `#${notification.orderNumber} — ${notification.customerName}`;

  switch (notification.type) {
    case 'ORDER_CREATED':
      toast.success(title, { description });
      break;
    case 'ORDER_READY':
      toast.success(title, { description });
      break;
    case 'PICKUP_REMINDER':
      toast.warning(title, { description });
      break;
    case 'URGENT_REMINDER':
      toast.error(title, { description });
      break;
    default:
      toast.info(title, { description });
  }
}

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { orders } = useOrders();
  const [notifications, setNotifications] = useState<Notification[]>(() =>
    notificationService.getNotifications()
  );
  const [reminderConfig] = useState<ReminderConfig>(DEFAULT_REMINDER_CONFIG);
  const reminderIntervalRef = useRef<number | null>(null);

  const syncNotifications = useCallback(() => {
    setNotifications(notificationService.getNotifications());
  }, []);

  /* ---------- Conectar servicio al ciclo de vida React ---------- */
  useEffect(() => {
    notificationService.setOnNotification((notification) => {
      syncNotifications();
      showToast(notification);
    });

    notificationService.start();

    return () => {
      notificationService.stop();
      notificationService.setOnNotification(null);
    };
  }, [syncNotifications]);

  /* ---------- Scheduler de recordatorios ----------
   * Pausa el polling cuando la pestaña está oculta para no consumir recursos
   * (relevante cuando esto consulte Supabase): solo se programa un nuevo tick
   * mientras `document.visibilityState === 'visible'`. */
  useEffect(() => {
    function checkReminders() {
      for (const order of orders) {
        if (order.status !== 'LISTO' || typeof order.daysReady !== 'number') continue;

        if (
          order.daysReady >= reminderConfig.urgentReminderDays &&
          !notificationService.hasNotificationForOrder(order.id, 'URGENT_REMINDER')
        ) {
          const event: OrderEvent = {
            type: 'URGENT_REMINDER',
            orderId: order.id,
            orderNumber: order.orderNumber,
            customerName: order.customerName,
            phone: order.phone,
            timestamp: new Date().toISOString(),
            payload: { daysReady: order.daysReady, rackNumber: order.rackNumber },
          };
          eventBus.emit(EVENT_NAMES.URGENT_REMINDER, event);
        } else if (
          order.daysReady >= reminderConfig.firstReminderDays &&
          !notificationService.hasNotificationForOrder(order.id, 'PICKUP_REMINDER')
        ) {
          const event: OrderEvent = {
            type: 'PICKUP_REMINDER',
            orderId: order.id,
            orderNumber: order.orderNumber,
            customerName: order.customerName,
            phone: order.phone,
            timestamp: new Date().toISOString(),
            payload: { daysReady: order.daysReady, rackNumber: order.rackNumber },
          };
          eventBus.emit(EVENT_NAMES.PICKUP_REMINDER, event);
        }
      }
    }

    function clearTimer() {
      if (reminderIntervalRef.current !== null) {
        window.clearInterval(reminderIntervalRef.current);
        reminderIntervalRef.current = null;
      }
    }

    function startTimer() {
      clearTimer();
      reminderIntervalRef.current = window.setInterval(
        checkReminders,
        reminderConfig.checkIntervalMs
      );
    }

    function handleVisibility() {
      if (document.visibilityState === 'visible') {
        checkReminders();
        startTimer();
      } else {
        clearTimer();
      }
    }

    if (document.visibilityState === 'visible') {
      checkReminders();
      startTimer();
    }
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      clearTimer();
    };
  }, [orders, reminderConfig]);

  /* ---------- Acciones ---------- */
  const markAsRead = useCallback((id: string) => {
    const updated = notificationService.markAsRead(id);
    setNotifications(updated);
  }, []);

  const markAllAsRead = useCallback(() => {
    const updated = notificationService.markAllAsRead();
    setNotifications(updated);
  }, []);

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications]
  );

  const value = useMemo<NotificationsContextType>(
    () => ({ notifications, unreadCount, markAsRead, markAllAsRead, reminderConfig }),
    [notifications, unreadCount, markAsRead, markAllAsRead, reminderConfig]
  );

  return (
    <NotificationsContext.Provider value={value}>
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationsContext);
  if (context === undefined) {
    throw new Error('useNotifications must be used within a NotificationsProvider');
  }
  return context;
}
