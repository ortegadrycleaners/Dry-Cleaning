/**
 * NotificationsPanel — Panel desplegable de historial de notificaciones.
 *
 * Muestra las notificaciones ordenadas cronológicamente, con iconos según tipo,
 * indicador de no leídas, y acciones para marcar como leídas.
 */
import { useState } from 'react';
import { useNotifications } from '@/context/NotificationsContext';
import { useI18n } from '@/i18n';
import { Button } from '@/components/ui/button';
import {
  Bell,
  CheckCircle2,
  Package,
  AlertTriangle,
  OctagonAlert,
  X,
  CheckCheck,
  MessageSquare,
} from 'lucide-react';
import type { NotificationEventType } from '@/types/notifications';

const TYPE_CONFIG: Record<
  NotificationEventType,
  { icon: typeof Bell; label: string; color: string; bg: string }
> = {
  ORDER_CREATED: {
    icon: Package,
    label: 'notifications.type.confirmation',
    color: 'text-blue-600',
    bg: 'bg-blue-50',
  },
  ORDER_RECEIVED_TRACKING: {
    icon: Package,
    label: 'notifications.type.received',
    color: 'text-blue-600',
    bg: 'bg-blue-50',
  },
  ORDER_DELAYED: {
    icon: AlertTriangle,
    label: 'notifications.type.delayed',
    color: 'text-amber-600',
    bg: 'bg-amber-50',
  },
  THANK_YOU_REVIEW: {
    icon: MessageSquare,
    label: 'notifications.type.thankYou',
    color: 'text-green-600',
    bg: 'bg-green-50',
  },
  ORDER_READY: {
    icon: CheckCircle2,
    label: 'notifications.type.ready',
    color: 'text-green-600',
    bg: 'bg-green-50',
  },
  PICKUP_REMINDER: {
    icon: AlertTriangle,
    label: 'notifications.type.reminder',
    color: 'text-amber-600',
    bg: 'bg-amber-50',
  },
  URGENT_REMINDER: {
    icon: OctagonAlert,
    label: 'notifications.type.urgent',
    color: 'text-red-600',
    bg: 'bg-red-50',
  },
};

export function NotificationsPanel() {
  const { t, timeAgo } = useI18n();
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative">
      {/* Botón campana */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-[#FAFAFC]/90 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
        aria-label={t('common.notifications')}
      >
        <Bell className="w-5 h-5 text-current" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Panel desplegable */}
      {isOpen && (
        <>
          {/* Overlay para cerrar */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />

          <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 bg-white rounded-xl shadow-2xl border border-gray-200 z-50 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-b border-gray-200">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-[#1B2A4A]" />
                <h3 className="text-sm font-semibold text-[#1B2A4A]">
                  {t('common.notifications')}
                </h3>
                {unreadCount > 0 && (
                  <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs font-medium rounded-full">
                    {unreadCount}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                {unreadCount > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={markAllAsRead}
                    className="h-7 px-2 text-xs text-gray-500 hover:text-gray-700"
                  >
                    <CheckCheck className="w-3.5 h-3.5 mr-1" />
                    {t('notifications.markAllAsRead')}
                  </Button>
                )}
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-1 text-gray-400 hover:text-gray-600 rounded"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Lista de notificaciones */}
            <div className="max-h-96 overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="px-4 py-8 text-center">
                  <Bell className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                  <p className="text-sm text-gray-500">
                    {t('notifications.noItems')}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    {t('notifications.noItemsSub')}
                  </p>
                </div>
              ) : (
                notifications.map((notification) => {
                  const config = TYPE_CONFIG[notification.type];
                  const Icon = config.icon;

                  return (
                    <button
                      key={notification.id}
                      onClick={() => markAsRead(notification.id)}
                      className={`w-full text-left px-4 py-3 border-b border-gray-100 last:border-0 hover:bg-slate-50 transition-colors ${
                        !notification.read ? 'bg-blue-50/30' : ''
                      }`}
                    >
                      <div className="flex gap-3">
                        <div
                          className={`flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center ${config.bg}`}
                        >
                          <Icon className={`w-4 h-4 ${config.color}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span
                              className={`text-xs font-semibold ${config.color}`}
                            >
                              {t(config.label)}
                            </span>
                            <span className="text-[10px] text-gray-400 flex-shrink-0">
                              {timeAgo(notification.createdAt)}
                            </span>
                          </div>
                          <p className="text-sm text-gray-700 font-medium mt-0.5 truncate">
                            #{notification.orderNumber} — {notification.customerName}
                          </p>
                          <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">
                            {notification.message}
                          </p>
                          <div className="flex items-center gap-2 mt-1.5">
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-500 uppercase">
                              {t('notifications.channelLabel', { channel: notification.channel })}
                            </span>
                            <span
                              className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                notification.status === 'sent'
                                  ? 'bg-green-100 text-green-700'
                                  : notification.status === 'failed'
                                    ? 'bg-red-100 text-red-700'
                                    : 'bg-yellow-100 text-yellow-700'
                              }`}
                            >
                              {notification.status === 'sent'
                                ? t('notifications.status.sent')
                                : notification.status === 'failed'
                                  ? t('notifications.status.failed')
                                  : t('notifications.status.pending')}
                            </span>
                            {!notification.read && (
                              <span className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0" />
                            )}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            {/* Footer */}
            {notifications.length > 0 && (
              <div className="px-4 py-2.5 bg-slate-50 border-t border-gray-200">
                <p className="text-[10px] text-gray-400 text-center">
                  {t('notifications.footer', {
                    count: notifications.length,
                    plural: notifications.length !== 1 ? 'es' : '',
                  })}
                </p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
