import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthContext';
import { useOrders } from '@/context/OrdersContext';
import type { Order } from '@/types';
import { daysSince, orderTicketLabel } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Plus,
  LogOut,
  Search,
  Package,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Send,
  Loader2,
  ShieldAlert,
  ShieldCheck,
  Link,
  Undo,
  Zap,
} from 'lucide-react';
import { NotificationsPanel } from '@/components/NotificationsPanel';
import LanguageToggle from '@/components/ui/LanguageToggle';
import {
  notifySmsTemplate,
  previewMessage,
  estimateSmsSegments,
  getUsageStats,
  getSmsHistory,
  isTwilioReady,
  type SmsUsageStats,
} from '@/services/twilio';
import { NOTIFICATION_TEMPLATE_OPTIONS, type NotificationEventType } from '@/types/notifications';
import { useI18n } from '@/i18n';

const REMINDER_DAYS = 3;
const ABANDON_DAYS = 30;

function resolveDaysReady(order: Order): number | null {
  if (order.status !== 'LISTO') return null;
  const derived = daysSince(order.statusUpdatedAt);
  if (typeof derived === 'number') return derived;
  return typeof order.daysReady === 'number' ? order.daysReady : null;
}

/* ---------- Modal: Marcar Listo (sólo cambia estado, no envía SMS) ---------- */

interface MarkReadyModalProps {
  order: Order | null;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (rackNumber: string) => void;
  validateRackNumber?: (rackNumber: string) => string | null;
}

function MarkReadyModal({ order, isOpen, onClose, onConfirm, validateRackNumber }: MarkReadyModalProps) {
  const { t } = useI18n();
  const [rackNumber, setRackNumber] = useState('');
  const [error, setError] = useState('');

  const handleConfirm = () => {
    const trimmedRack = rackNumber.trim();
    if (!trimmedRack) {
      setError(t('dashboard.markReady.rackNumberRequired'));
      return;
    }

    if (validateRackNumber) {
      const validationError = validateRackNumber(trimmedRack);
      if (validationError) {
        setError(validationError);
        return;
      }
    }

    onConfirm(trimmedRack);
    setRackNumber('');
    setError('');
  };

  const handleClose = () => {
    setRackNumber('');
    setError('');
    onClose();
  };

  if (!order) return null;

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold text-[#1B2A4A]">
            {t('dashboard.markReady.title')}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="bg-slate-50 p-3 rounded-lg">
            <p className="text-sm text-gray-600">
              {t('dashboard.markReady.orderLabel')}{' '}
              <span className="font-semibold text-[#1B2A4A]">
                #{orderTicketLabel(order)}
              </span>
            </p>
            <p className="text-sm text-gray-600">
              {t('dashboard.markReady.customerLabel')}{' '}
              <span className="font-medium">{order.customerName}</span>
            </p>
          </div>
          <div className="space-y-2">
            <Label
              htmlFor="rackNumber"
              className="text-sm font-medium text-gray-700"
            >
              {t('dashboard.markReady.rackNumberLabel')}
            </Label>
            <Input
              id="rackNumber"
              type="text"
              placeholder={t('dashboard.markReady.rackNumberPlaceholder')}
              value={rackNumber}
              onChange={(e) => setRackNumber(e.target.value)}
              className="h-11 border-gray-200 focus:border-[#3B4BFF] focus:ring-[#3B4BFF]"
            />
            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>
          <Button
            onClick={handleConfirm}
            className="w-full h-11 bg-[#3B4BFF] hover:bg-[#2F3DE6] text-white font-semibold"
          >
            {t('dashboard.markReady.confirmButton')}
          </Button>
          <p className="text-xs text-center text-gray-500">
            {t('dashboard.markReady.smsHint')}
          </p>
          <Button
            variant="ghost"
            onClick={handleClose}
            className="w-full h-10 text-gray-500 hover:text-gray-700"
          >
            {t('common.cancel')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ---------- Modal: SMS cliente (único disparador de SMS) ---------- */

interface NotifyCustomerModalProps {
  order: Order | null;
  isOpen: boolean;
  onClose: () => void;
  onSent: () => void;
  operatorId: string;
  templateType: NotificationEventType;
  daysReady: number | null;
}

function NotifyCustomerModal({
  order,
  isOpen,
  onClose,
  onSent,
  operatorId,
  templateType,
  daysReady,
}: NotifyCustomerModalProps) {
  const { t } = useI18n();
  const [isSending, setIsSending] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<NotificationEventType>(templateType);
  // Tick incremental: cada apertura del modal y cada envío refresca usage
  // sin caer en setState-dentro-de-useEffect.
  const [usageTick, setUsageTick] = useState(0);

  useEffect(() => {
    if (isOpen && selectedType !== templateType) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedType(templateType);
    }
  }, [isOpen, templateType, selectedType]);

  // Limpia error cuando se abre el modal. Usa el cambio de `isOpen` como key
  // efectivo via remount-style: se evita useEffect+setState anidado.
  const errorToShow = isOpen ? errorMsg : null;

  const usage: SmsUsageStats = useMemo(() => {
    // Dependemos de isOpen y usageTick para recomputar cuando se abre o
    // tras un envío.
    void isOpen;
    void usageTick;
    return getUsageStats();
  }, [isOpen, usageTick]);

  if (!order) return null;

  const smsOrder = daysReady !== null ? { ...order, daysReady } : order;
  const activeTemplate = NOTIFICATION_TEMPLATE_OPTIONS.find((option) => option.type === selectedType);
  const message = previewMessage(smsOrder, selectedType);
  const segments = estimateSmsSegments(message);
  const ready = isTwilioReady();
  const isReminder = selectedType === 'PICKUP_REMINDER' || selectedType === 'URGENT_REMINDER';

  const handleSend = async () => {
    if (isSending) return;
    setIsSending(true);
    setErrorMsg(null);

    const result = await notifySmsTemplate({
      order: smsOrder,
      operatorId,
      type: selectedType,
      daysReady,
    });

    setIsSending(false);
    setUsageTick((t) => t + 1);

    if (result.ok) {
      toast.success(
        isReminder ? t('dashboard.notify.sentReminder') : t('dashboard.notify.sentSms'),
        {
          description: `#${order.orderNumber} — ${order.customerName}`,
        }
      );
      onSent();
      onClose();
      return;
    }

    setErrorMsg(result.errorMessage ?? t('dashboard.notify.sendError'));
    toast.error(
      isReminder ? t('dashboard.notify.failedReminder') : t('dashboard.notify.failedSms'),
      {
        description: result.errorMessage ?? t('dashboard.notify.failedDescription'),
      }
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !isSending && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold text-[#1B2A4A] flex items-center gap-2">
            <Send className="w-5 h-5 text-[#C9A84C]" />
            {isReminder ? t('dashboard.notify.titleReminder') : t('dashboard.notify.titleSms')}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label className="text-sm font-medium text-gray-700">{t('dashboard.notify.templateLabel')}</Label>
            <div className="flex flex-wrap gap-2">
              {NOTIFICATION_TEMPLATE_OPTIONS.map((option) => {
                const isActive = option.type === selectedType;
                return (
                  <Button
                    key={option.type}
                    type="button"
                    variant={isActive ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setSelectedType(option.type)}
                    className={isActive
                      ? 'bg-[#3B4BFF] hover:bg-[#2F3DE6] text-white'
                      : 'border-gray-300 text-gray-700 hover:bg-gray-50'}
                  >
                    {option.label}
                  </Button>
                );
              })}
            </div>
            {activeTemplate && (
              <p className="text-xs text-gray-500">
                {t('dashboard.notify.selectedTemplate', { template: activeTemplate.label })}
              </p>
            )}
          </div>

          <div className="bg-slate-50 p-3 rounded-lg space-y-1">
            <p className="text-sm text-gray-600">
              {t('dashboard.notify.orderLabel')}{' '}
              <span className="font-semibold text-[#1B2A4A]">
                #{orderTicketLabel(order)}
              </span>
            </p>
            <p className="text-sm text-gray-600">
              {t('dashboard.notify.customerLabel')}{' '}
              <span className="font-medium">{order.customerName}</span>
            </p>
            <p className="text-sm text-gray-600">
              {t('dashboard.notify.phoneLabel')}{' '}
              <span className="font-mono">{order.phone}</span>
            </p>
            {order.rackNumber && (
              <p className="text-sm text-gray-600">
                {t('dashboard.notify.rackLabel')}{' '}
                <span className="font-medium">#{order.rackNumber}</span>
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium text-gray-700">{t('dashboard.notify.messageLabel')}</Label>
            <div className="rounded-lg border border-gray-200 bg-white p-3 text-sm text-gray-800 whitespace-pre-wrap">
              {message}
            </div>
            <div className="flex items-center justify-between text-xs text-gray-500">
              <span>{t('dashboard.notify.messageLength', { count: message.length })}</span>
              <span>
                {t('dashboard.notify.messageSegments', { count: segments, plural: segments !== 1 ? 's' : '' })}
              </span>
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 bg-slate-50 p-3 text-xs text-gray-600 space-y-1">
            <div className="flex items-center justify-between">
              <span>{t('dashboard.notify.modeLabel')}</span>
              <span className="font-medium">
                {usage.mockMode ? t('dashboard.notify.mockMode') : t('dashboard.notify.productionMode')}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>{t('dashboard.notify.smsLastMinute')}</span>
              <span className="font-medium">
                {usage.sentLastMinute} / {usage.globalPerMinuteCap}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>{t('dashboard.notify.smsLast24Hours')}</span>
              <span className="font-medium">
                {usage.sentLastDay} / {usage.dailyBudget}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>{t('dashboard.notify.remainingBudget')}</span>
              <span className="font-medium">{usage.remainingDailyBudget}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>{t('dashboard.notify.killSwitchLabel')}</span>
              <span
                className={`font-medium ${usage.killSwitch ? 'text-red-600' : 'text-green-600'}`}
              >
                {usage.killSwitch ? t('dashboard.notify.killSwitchActive') : t('dashboard.notify.killSwitchInactive')}
              </span>
            </div>
          </div>

          {!ready && !usage.mockMode && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800 flex gap-2">
              <ShieldAlert className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <p>
                {t('dashboard.notify.twilioNotConfigured')}{' '}
                <code className="font-mono">VITE_NOTIFY_ENDPOINT_URL</code>.
                {t('dashboard.notify.twilioMockHint')}
              </p>
            </div>
          )}

          {errorToShow && (
            <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800 flex gap-2">
              <ShieldAlert className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <p>{errorToShow}</p>
            </div>
          )}

          <Button
            onClick={handleSend}
            disabled={isSending || (!ready && !usage.mockMode) || usage.killSwitch}
            className="w-full h-11 bg-[#3B4BFF] hover:bg-[#2F3DE6] text-white font-semibold disabled:opacity-50"
          >
            {isSending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {t('dashboard.notify.sending')}
              </>
            ) : (
              <>
                <Send className="w-4 h-4 mr-2" />
                {isReminder ? t('dashboard.notify.sendReminder') : t('dashboard.notify.sendSms')}
              </>
            )}
          </Button>

          <p className="text-[11px] text-center text-gray-500 leading-snug">
            {t('dashboard.notify.auditNote')}
          </p>

          <Button
            variant="ghost"
            onClick={onClose}
            disabled={isSending}
            className="w-full h-10 text-gray-500 hover:text-gray-700"
          >
            {t('common.cancel')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ---------- Helper: ¿esta orden ya fue notificada? ---------- */

function useNotifiedOrderIdsByType(
  type: NotificationEventType,
  refreshTick: number
): Set<string> {
  return useMemo(() => {
    const ids = new Set<string>();
    for (const r of getSmsHistory()) {
      if (r.templateType === type) ids.add(r.orderId);
    }
    return ids;
    // refreshTick fuerza recomputo cuando se envía un SMS nuevo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshTick, type]);
}

/* ---------- Status badge ---------- */

function StatusBadge({ order }: { order: Order }) {
  const { t, translateOrderStatus, formatDate } = useI18n();
  const { status } = order;
  const daysReady = resolveDaysReady(order);
  const translatedStatus = translateOrderStatus(status);

  if (status === 'ENTREGADO') {
    return (
      <span
        className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold"
        style={{ backgroundColor: '#F3F4F6', color: '#374151', border: '1px solid #E8E8F0' }}
      >
        <CheckCircle2 className="w-3 h-3 mr-1 text-[#6B7280]" />
        {translatedStatus}
      </span>
    );
  }

  if (status === 'ABANDONADO') {
    return (
      <span
        className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold"
        style={{ backgroundColor: '#FFF1F2', color: '#B91C1C', border: '1px solid #FECACA' }}
      >
        <AlertTriangle className="w-3 h-3 mr-1 text-[#B91C1C]" />
        {translatedStatus}
      </span>
    );
  }

  if (status === 'LISTO' && daysReady && daysReady >= 2) {
    return (
      <span className="relative inline-flex group">
        <span
          className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold"
          style={{ backgroundColor: '#E6FAF1', color: '#047857', border: '1px solid #CFF0E3' }}
        >
          <AlertTriangle className="w-3 h-3 mr-1 text-[#047857]" />
          {t('dashboard.status.readyDays', {
            days: daysReady,
            rack: order.rackNumber ? ` · RACK ${order.rackNumber}` : '',
          })}
        </span>

        <span className="pointer-events-none absolute left-1/2 bottom-full mb-2 -translate-x-1/2 rounded-md bg-slate-900 px-2 py-1 text-xs text-white opacity-0 transition-opacity duration-150 group-hover:opacity-100">
          {order.statusUpdatedAt ? t('dashboard.status.readySince', { date: formatDate(order.statusUpdatedAt) }) : t('dashboard.status.ready')}
        </span>
      </span>
    );
  }

  if (status === 'LISTO') {
    return (
      <span className="relative inline-flex group">
        <span
          className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold"
          style={{ backgroundColor: '#E6FAF1', color: '#047857', border: '1px solid #CFF0E3' }}
        >
          <CheckCircle2 className="w-3 h-3 mr-1 text-[#047857]" />
          {order.rackNumber ? `${translatedStatus} · RACK ${order.rackNumber}` : translatedStatus}
        </span>

        <span className="pointer-events-none absolute left-1/2 bottom-full mb-2 -translate-x-1/2 rounded-md bg-slate-900 px-2 py-1 text-xs text-white opacity-0 transition-opacity duration-150 group-hover:opacity-100">
          {order.statusUpdatedAt ? t('dashboard.status.readySince', { date: formatDate(order.statusUpdatedAt) }) : translatedStatus}
        </span>
      </span>
    );
  }

  if (status === 'EN PROCESO') {
    return (
      <span
        className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold"
        style={{ backgroundColor: '#EEF2FF', color: '#3B4BFF', border: '1px solid rgba(59,75,255,0.08)' }}
      >
        <Clock className="w-3 h-3 mr-1 text-[#3B4BFF]" />
        {translatedStatus}
      </span>
    );
  }

  return (
    <span
      className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold"
      style={{ backgroundColor: '#FFF4E6', color: '#8B5E3C', border: '1px solid #F6E9DA' }}
    >
      <Package className="w-3 h-3 mr-1 text-[#8B5E3C]" />
      {translatedStatus}
    </span>
  );
}

/* ---------- Página ---------- */

export function DashboardPage() {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const { orders, updateOrderStatus } = useOrders();
  const [searchQuery, setSearchQuery] = useState('');

  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [isReadyModalOpen, setIsReadyModalOpen] = useState(false);

  const [notifyOrder, setNotifyOrder] = useState<Order | null>(null);
  const [isNotifyModalOpen, setIsNotifyModalOpen] = useState(false);
  const [notifyTemplateType, setNotifyTemplateType] = useState<NotificationEventType>('ORDER_READY');
  const [notifyDaysReady, setNotifyDaysReady] = useState<number | null>(null);

  // Tick que se incrementa cuando se completa un envío para refrescar el set
  // de órdenes ya notificadas (lectura desde localStorage).
  const [historyTick, setHistoryTick] = useState(0);
  const [pendingDelivery, setPendingDelivery] = useState<{ orderId: string; timeoutId: number } | null>(null);
  const { t, formatDate } = useI18n();
  const notifiedReadyIds = useNotifiedOrderIdsByType('ORDER_READY', historyTick);
  const notifiedReminderIds = useNotifiedOrderIdsByType('PICKUP_REMINDER', historyTick);

  const filteredOrders = useMemo(() => {
    if (!searchQuery.trim()) return orders;
    const query = searchQuery.toLowerCase();
    return orders.filter((order) => {
      const ticket = orderTicketLabel(order);
      return (
        order.phone.toLowerCase().includes(query) ||
        order.id.toLowerCase().includes(query) ||
        (order.publicId ?? '').toLowerCase().includes(query) ||
        ticket.toLowerCase().includes(query)
      );
    });
  }, [orders, searchQuery]);

  const buildTrackingUrl = (order: Order) =>
    `${window.location.origin}/tracking/${order.publicId ?? order.id}`;

  const handleCopyTrackingLink = async (order: Order) => {
    const url = buildTrackingUrl(order);
    try {
      await navigator.clipboard.writeText(url);
      toast.success(t('dashboard.clipboard.success'), {
        description: `#${order.orderNumber} — ${order.customerName}`,
      });
    } catch (error) {
      console.error('[DashboardPage] Copy tracking link failed:', error);
      toast.error(t('dashboard.clipboard.error'), {
        description: t('dashboard.clipboard.errorDescription'),
      });
    }
  };

  const normalizePhoneDigits = (phone: string) => phone.replace(/\D/g, '');

  const validateRackAssignment = (rackNumber: string): string | null => {
    if (!selectedOrder) return null;
    const normalizedRack = rackNumber.trim().toLowerCase();
    const normalizedPhone = normalizePhoneDigits(selectedOrder.phone);

    const conflictingOrder = orders.find((order) => {
      if (!order.rackNumber) return false;
      if (order.id === selectedOrder.id) return false;
      if (order.rackNumber.trim().toLowerCase() !== normalizedRack) return false;
      const orderPhone = normalizePhoneDigits(order.phone);
      return orderPhone !== normalizedPhone;
    });

    if (conflictingOrder) {
      return t('dashboard.markReady.rackOccupiedBy', {
        rackNumber,
        customerName: conflictingOrder.customerName,
      });
    }
    return null;
  };

  const handleMarkReady = (order: Order) => {
    setSelectedOrder(order);
    setIsReadyModalOpen(true);
  };

  const handleConfirmReady = (rackNumber: string) => {
    if (selectedOrder) {
      updateOrderStatus(selectedOrder.id, 'LISTO', rackNumber);
      toast.success(t('dashboard.markReady.success'), {
        description: t('dashboard.markReady.successDescription'),
      });
    }
    setIsReadyModalOpen(false);
    setSelectedOrder(null);
  };

  const handleOpenNotify = (
    order: Order,
    templateType: NotificationEventType,
    daysReady: number | null
  ) => {
    setNotifyOrder(order);
    setNotifyTemplateType(templateType);
    setNotifyDaysReady(daysReady);
    setIsNotifyModalOpen(true);
  };

  const handleNotified = () => {
    setHistoryTick((t) => t + 1);
  };

  const handleMarkDelivered = (orderId: string) => {
    // Mostrar warning con opción de revertir
    const timeoutId = window.setTimeout(() => {
      updateOrderStatus(orderId, 'ENTREGADO');
      setPendingDelivery(null);
      toast.success(t('dashboard.delivery.markedDelivered'));
    }, 5000);

    setPendingDelivery({ orderId, timeoutId });

    toast.warning(t('dashboard.delivery.willNotify'), {
      description: t('dashboard.delivery.willNotifyDescription'),
      action: {
        label: t('dashboard.delivery.revert'),
        onClick: () => handleCancelDelivery(),
      },
      duration: 5000,
    });
  };

  const handleCancelDelivery = () => {
    if (pendingDelivery) {
      clearTimeout(pendingDelivery.timeoutId);
      setPendingDelivery(null);
      toast.success(t('dashboard.delivery.cancelled'));
    }
  };

  const handleRevertToReceived = (orderId: string) => {
    updateOrderStatus(orderId, 'RECIBIDO');
    toast.success(t('dashboard.status.revertedReceived'));
  };

  const handleRevertToReady = (orderId: string) => {
    updateOrderStatus(orderId, 'LISTO');
    toast.success(t('dashboard.status.revertedReady'));
  };

  const handleMarkAbandoned = (orderId: string) => {
    updateOrderStatus(orderId, 'ABANDONADO');
    toast.success(t('dashboard.status.markedAbandoned'));
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <header className="bg-[#0E0E1A] sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <img
                src="/svg/zivo-wordmark-white.svg"
                alt="zivo"
                className="h-6 sm:h-8 w-auto"
              />
              <div className="hidden sm:flex items-center ml-3 text-sm text-[#FAFAFC]/90">
                {t('dashboard.header.currentLocation')} <span className="ml-2 font-semibold text-white">Ortega Dry Cleaners</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <NotificationsPanel />
              <LanguageToggle inline />
              <button
                onClick={handleLogout}
                className="text-sm text-[#FAFAFC]/90 hover:text-white flex items-center gap-1 px-3 py-2 rounded-md hover:bg-white/5"
              >
                <LogOut className="w-4 h-4" />
                <span className="hidden sm:inline">{t('dashboard.header.logout')}</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="mb-6 flex items-center justify-between">
          <div className="relative max-w-md w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              type="text"
              placeholder={t('dashboard.searchPlaceholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 h-11 border-gray-200 focus:border-[#3B4BFF] focus:ring-[#3B4BFF]"
            />
          </div>
          <div className="ml-4 flex-shrink-0">
            <Button onClick={() => navigate('/dashboard/nueva')} className="rounded-full px-4 py-2">
              <Plus className="w-4 h-4 mr-2" />
              {t('dashboard.newOrder')}
            </Button>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          {filteredOrders.length === 0 ? (
            <div className="p-12 text-center">
              <Package className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                {t('dashboard.empty.title')}
              </h3>
              <p className="text-gray-500 mb-4">
                {t('dashboard.empty.subtitle')}
              </p>
              <Button onClick={() => navigate('/dashboard/nueva')} className="rounded-full px-4 py-2">
                <Plus className="w-4 h-4 mr-2" />
                {t('dashboard.newOrder')}
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50">
                    <TableHead className="font-semibold text-gray-700">{t('dashboard.table.orderNumber')}</TableHead>
                    <TableHead className="font-semibold text-gray-700">{t('dashboard.table.customer')}</TableHead>
                    <TableHead className="font-semibold text-gray-700">{t('dashboard.table.phone')}</TableHead>
                    <TableHead className="font-semibold text-gray-700">{t('dashboard.table.estimatedDate')}</TableHead>
                    <TableHead className="font-semibold text-gray-700">{t('dashboard.table.status')}</TableHead>
                    <TableHead className="font-semibold text-gray-700">{t('dashboard.table.actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredOrders.map((order) => {
                    const daysReady = resolveDaysReady(order);
                    const isReminder = typeof daysReady === 'number' && daysReady >= REMINDER_DAYS;
                    const isAbandonEligible = typeof daysReady === 'number' && daysReady >= ABANDON_DAYS;
                    const templateType: NotificationEventType = isReminder ? 'PICKUP_REMINDER' : 'ORDER_READY';
                    const alreadyNotified = isReminder
                      ? notifiedReminderIds.has(order.id)
                      : notifiedReadyIds.has(order.id);
                    const notifyLabel = isReminder ? t('dashboard.actions.reminder') : t('dashboard.actions.notifyCustomer');
                    const notifyTooltip = isReminder
                      ? t('dashboard.actions.reminderTooltip')
                      : t('dashboard.actions.notifyCustomerTooltip');
                    const notifiedLabel = isReminder ? t('dashboard.actions.reminderSent') : t('dashboard.actions.notified');
                    return (
                        <TableRow key={order.id} className="hover:bg-[#FFF4E6]">
                        <TableCell className="font-medium text-[#1B2A4A]">
                          #{orderTicketLabel(order)}
                        </TableCell>
                        <TableCell>{order.customerName}</TableCell>
                        <TableCell className="text-gray-600">{order.phone}</TableCell>
                        <TableCell className="text-gray-600">{order.estimatedDate}</TableCell>
                        <TableCell>
                          <StatusBadge order={order} />
                          {/* Rack number shown inside the LISTO badge; remove side label */}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="relative inline-flex group">
                              <Button
                                size="icon-sm"
                                variant="outline"
                                onClick={() => handleCopyTrackingLink(order)}
                                className="border-gray-300 text-gray-600 hover:bg-gray-50"
                                aria-label={t('dashboard.actions.copyTrackingLabel')}
                                title={t('dashboard.actions.copyTrackingLabel')}
                              >
                                <Link className="w-3.5 h-3.5" />
                              </Button>

                              <span className="pointer-events-none absolute left-1/2 bottom-full mb-2 -translate-x-1/2 rounded-md bg-slate-900 px-2 py-1 text-xs text-white opacity-0 transition-opacity duration-150 group-hover:opacity-100">
                                {order.statusUpdatedAt
                                  ? t('dashboard.actions.copyTrackingTooltipWithDate', {
                                      date: formatDate(order.statusUpdatedAt),
                                    })
                                  : t('dashboard.actions.copyTrackingLabel')}
                              </span>
                            </span>
                            {(order.status === 'RECIBIDO' || order.status === 'EN PROCESO') && (
                              <span className="relative inline-flex group">
                                <Button
                                  size="sm"
                                  onClick={() => handleMarkReady(order)}
                                  className="bg-[#3B4BFF] hover:bg-[#2F3DE6] text-white text-xs font-semibold"
                                  title={t('dashboard.actions.markReady')}
                                >
                                  {t('dashboard.actions.markReady')}
                                </Button>

                                <span className="pointer-events-none absolute left-1/2 bottom-full mb-2 -translate-x-1/2 rounded-md bg-slate-900 px-2 py-1 text-xs text-white opacity-0 transition-opacity duration-150 group-hover:opacity-100">
                                  {t('dashboard.actions.markReady')}
                                </span>
                              </span>
                            )}

                            {order.status === 'LISTO' && !alreadyNotified && (
                              <span className="relative inline-flex group">
                                  <Button
                                    size="sm"
                                    onClick={() => handleOpenNotify(order, templateType, daysReady)}
                                    className="bg-[#FFF4E6] hover:bg-[#FFF1DA] text-[#0E0E1A] text-xs font-semibold"
                                    title={notifyTooltip}
                                  >
                                    <Send className="w-3.5 h-3.5 mr-1 text-[#3B4BFF]" />
                                      {notifyLabel}
                                  </Button>

                                <span className="pointer-events-none absolute left-1/2 bottom-full mb-2 -translate-x-1/2 rounded-md bg-slate-900 px-2 py-1 text-xs text-white opacity-0 transition-opacity duration-150 group-hover:opacity-100">
                                    {notifyTooltip}
                                </span>
                              </span>
                            )}

                            {order.status === 'LISTO' && alreadyNotified && (
                              <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-green-50 text-green-700 border border-green-200">
                                <ShieldCheck className="w-3.5 h-3.5 mr-1" />
                                {notifiedLabel}
                              </span>
                            )}

                            {order.status === 'LISTO' && (
                              <span className="relative inline-flex group">
                                <Button
                                  size="sm"
                                  onClick={() => handleMarkDelivered(order.id)}
                                  disabled={pendingDelivery?.orderId === order.id}
                                  className="bg-green-600 hover:bg-green-700 text-white text-xs disabled:opacity-50"
                                  title={t('dashboard.actions.markDelivered')}
                                >
                                  {pendingDelivery?.orderId === order.id ? (
                                    <>
                                      <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                                      {t('dashboard.actions.processing')}
                                    </>
                                  ) : (
                                    t('dashboard.actions.markDelivered')
                                  )}
                                </Button>

                                <span className="pointer-events-none absolute left-1/2 bottom-full mb-2 -translate-x-1/2 rounded-md bg-slate-900 px-2 py-1 text-xs text-white opacity-0 transition-opacity duration-150 group-hover:opacity-100">
                                  {t('dashboard.actions.markDeliveredTooltip')}
                                </span>
                              </span>
                            )}

                            {order.status === 'LISTO' && isAbandonEligible && (
                              <span className="relative inline-flex group">
                                <Button
                                  size="sm"
                                  onClick={() => handleMarkAbandoned(order.id)}
                                  className="bg-red-600 hover:bg-red-700 text-white text-xs"
                                  title={t('dashboard.actions.markAbandoned')}
                                >
                                  {t('dashboard.actions.abandoned')}
                                </Button>

                                <span className="pointer-events-none absolute left-1/2 bottom-full mb-2 -translate-x-1/2 rounded-md bg-slate-900 px-2 py-1 text-xs text-white opacity-0 transition-opacity duration-150 group-hover:opacity-100">
                                  {t('dashboard.actions.markAbandonedTooltip')}
                                </span>
                              </span>
                            )}

                            {order.status === 'LISTO' && (
                              <span className="relative inline-flex group">
                                <Button
                                  size="icon-sm"
                                  variant="outline"
                                  onClick={() => handleRevertToReceived(order.id)}
                                  className="border-gray-300 text-gray-600 hover:bg-gray-50"
                                  title={t('dashboard.actions.revert')}
                                  aria-label={t('dashboard.actions.revert')}
                                >
                                  <Undo className="w-3.5 h-3.5" />
                                </Button>

                                <span className="pointer-events-none absolute left-1/2 bottom-full mb-2 -translate-x-1/2 rounded-md bg-slate-900 px-2 py-1 text-xs text-white opacity-0 transition-opacity duration-150 group-hover:opacity-100">
                                  {t('dashboard.actions.revert')}
                                </span>
                              </span>
                            )}

                            {order.status === 'ENTREGADO' && (
                              <span className="relative inline-flex group">
                                <Button
                                  size="icon-sm"
                                  variant="outline"
                                  onClick={() => handleRevertToReady(order.id)}
                                  className="border-gray-300 text-gray-600 hover:bg-gray-50"
                                  title={t('dashboard.actions.revert')}
                                  aria-label={t('dashboard.actions.revert')}
                                >
                                  <Undo className="w-3.5 h-3.5" />
                                </Button>

                                <span className="pointer-events-none absolute left-1/2 bottom-full mb-2 -translate-x-1/2 rounded-md bg-slate-900 px-2 py-1 text-xs text-white opacity-0 transition-opacity duration-150 group-hover:opacity-100">
                                  {t('dashboard.actions.revert')}
                                </span>
                              </span>
                            )}

                            {order.status === 'ABANDONADO' && (
                              <span className="relative inline-flex group">
                                <Button
                                  size="icon-sm"
                                  variant="outline"
                                  onClick={() => handleRevertToReady(order.id)}
                                  className="border-gray-300 text-gray-600 hover:bg-gray-50"
                                  title={t('dashboard.actions.revert')}
                                  aria-label={t('dashboard.actions.revert')}
                                >
                                  <Undo className="w-3.5 h-3.5" />
                                </Button>

                                <span className="pointer-events-none absolute left-1/2 bottom-full mb-2 -translate-x-1/2 rounded-md bg-slate-900 px-2 py-1 text-xs text-white opacity-0 transition-opacity duration-150 group-hover:opacity-100">
                                  {t('dashboard.actions.revert')}
                                </span>
                              </span>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </main>

      <footer className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-6">
        <div className="border-t border-gray-200 pt-4 flex items-center justify-between gap-4 text-sm text-gray-600">
          <p className="truncate">
            Ortega Dry Cleaners — Seguimiento de órdenes y atención con claridad.
          </p>
          <p className="inline-flex items-center gap-1 text-gray-500 whitespace-nowrap">
            <Zap className="w-4 h-4 text-[#3B4BFF]" />
            Powered by Zivo
          </p>
        </div>
      </footer>

      <MarkReadyModal
        order={selectedOrder}
        isOpen={isReadyModalOpen}
        onClose={() => setIsReadyModalOpen(false)}
        onConfirm={handleConfirmReady}
        validateRackNumber={validateRackAssignment}
      />

      <NotifyCustomerModal
        order={notifyOrder}
        isOpen={isNotifyModalOpen}
        onClose={() => setIsNotifyModalOpen(false)}
        onSent={handleNotified}
        operatorId="backoffice-operator"
        templateType={notifyTemplateType}
        daysReady={notifyDaysReady}
      />
    </div>
  );
}
