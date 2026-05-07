/**
 * NotificationsPanel — Panel desplegable de historial de notificaciones.
 *
 * Muestra las notificaciones ordenadas cronológicamente, con iconos según tipo,
 * indicador de no leídas, y acciones para marcar como leídas.
 */
import { useState } from 'react';
import { useNotifications } from '@/context/NotificationsContext';
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
    label: 'Confirmación',
    color: 'text-blue-600',
    bg: 'bg-blue-50',
  },
  ORDER_READY: {
    icon: CheckCircle2,
    label: 'Lista',
    color: 'text-green-600',
    bg: 'bg-green-50',
  },
  PICKUP_REMINDER: {
    icon: AlertTriangle,
    label: 'Recordatorio',
    color: 'text-amber-600',
    bg: 'bg-amber-50',
  },
  URGENT_REMINDER: {
    icon: OctagonAlert,
    label: 'Urgente',
    color: 'text-red-600',
    bg: 'bg-red-50',
  },
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'Ahora';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

export function NotificationsPanel() {
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative">
      {/* Botón campana */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
        aria-label="Notificaciones"
      >
        <Bell className="w-5 h-5" />
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
                  Notificaciones
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
                    Leer todo
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
                    No hay notificaciones aún
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    Las notificaciones aparecerán aquí al crear o actualizar órdenes
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
                              {config.label}
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
                              {notification.channel}
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
                                ? 'Enviado'
                                : notification.status === 'failed'
                                  ? 'Fallido'
                                  : 'Pendiente'}
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
                  {notifications.length} notificación{notifications.length !== 1 ? 'es' : ''} ·
                  Cada enlace incluye token de seguridad único
                </p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
