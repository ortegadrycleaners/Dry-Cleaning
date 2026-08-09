import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
  Link,
  Undo,
  Zap,
  Funnel,
  Settings,
  MessageSquarePlus,
  StickyNote,
} from 'lucide-react';
import { NotificationsPanel } from '@/components/NotificationsPanel';
import { ReminderTaskHandler } from '@/components/ReminderTaskHandler';
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
import { fetchRackConflict, type OrdersViewMode } from '@/services/supabase/ordersService';

const REMINDER_DAYS = 3;

function resolveDaysReady(order: Order): number | null {
  if (order.status !== 'LISTO') return null;
  const derived = daysSince(order.statusUpdatedAt);
  if (typeof derived === 'number') return derived;
  return typeof order.daysReady === 'number' ? order.daysReady : null;
}

/* ---------- Modal: Marcar Listo + countdown SMS automático ---------- */

interface MarkReadyModalProps {
  order: Order | null;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (rackNumber: string) => Promise<boolean>;
  onSendSms: (order: Order) => Promise<void>;
  validateRackNumber?: (rackNumber: string) => string | null | Promise<string | null>;
}

function MarkReadyModal({ order, isOpen, onClose, onConfirm, onSendSms, validateRackNumber }: MarkReadyModalProps) {
  const { t } = useI18n();
  const [rackNumber, setRackNumber] = useState('');
  const [error, setError] = useState('');
  const [step, setStep] = useState<'form' | 'countdown' | 'sending'>('form');
  const [countdown, setCountdown] = useState(3);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Reset al cerrar
  useEffect(() => {
    if (!isOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStep('form');
      setCountdown(3);
      setRackNumber('');
      setError('');
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }
  }, [isOpen]);

  // Countdown interval
  useEffect(() => {
    if (step !== 'countdown') return;

    intervalRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(intervalRef.current!);
          intervalRef.current = null;
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [step]);

  // Cuando el countdown llega a 0, disparar el SMS
  useEffect(() => {
    if (step !== 'countdown' || countdown !== 0 || !order) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStep('sending');
    void onSendSms(order).finally(() => {
      onClose();
    });
  }, [countdown, step, order, onSendSms, onClose]);

  const [isConfirming, setIsConfirming] = useState(false);

  const handleConfirm = async () => {
    const trimmedRack = rackNumber.trim();
    if (!trimmedRack) {
      setError(t('dashboard.markReady.rackNumberRequired'));
      return;
    }

    if (validateRackNumber) {
      const validationError = await Promise.resolve(validateRackNumber(trimmedRack));
      if (validationError) {
        setError(validationError);
        return;
      }
    }

    setIsConfirming(true);
    const persisted = await onConfirm(trimmedRack);
    setIsConfirming(false);
    if (!persisted) {
      setError(t('dashboard.markReady.statusUpdateFailed'));
      return;
    }

    setError('');
    setRackNumber('');
    setStep('countdown');
    setCountdown(3);
  };

  const handleCancelSms = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    onClose();
  };

  if (!order) return null;

  const plural = countdown === 1 ? '' : 's';

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && step !== 'sending' && handleCancelSms()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold text-[#1B2A4A]">
            {step === 'form'
              ? t('dashboard.markReady.title')
              : step === 'sending'
              ? t('dashboard.markReady.smsSending')
              : t('dashboard.markReady.smsCountdownTitle')}
          </DialogTitle>
        </DialogHeader>

        {step === 'form' ? (
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
                onKeyDown={(e) => e.key === 'Enter' && void handleConfirm()}
                className="h-11 border-gray-200 focus:border-[#3B4BFF] focus:ring-[#3B4BFF]"
              />
              {error && <p className="text-sm text-red-600">{error}</p>}
            </div>
            <p className="text-xs text-center text-gray-500">
              {t('dashboard.markReady.smsHint')}
            </p>
            <Button
              onClick={() => void handleConfirm()}
              disabled={isConfirming}
              className="w-full h-11 bg-[#3B4BFF] hover:bg-[#2F3DE6] text-white font-semibold disabled:opacity-60"
            >
              {t('dashboard.markReady.confirmButton')}
            </Button>
            <Button
              variant="ghost"
              onClick={handleCancelSms}
              className="w-full h-10 text-gray-500 hover:text-gray-700"
            >
              {t('common.cancel')}
            </Button>
          </div>
        ) : step === 'countdown' ? (
          <div className="space-y-6 pt-2">
            {/* Countdown visual */}
            <div className="flex flex-col items-center gap-4 py-4">
              <div
                className="flex items-center justify-center w-20 h-20 rounded-full text-4xl font-bold text-white"
                style={{
                  background: 'linear-gradient(135deg, #3B4BFF 0%, #6C7AFF 100%)',
                  boxShadow: '0 0 0 6px rgba(59,75,255,0.15)',
                }}
              >
                {countdown}
              </div>
              <div className="text-center space-y-1">
                <p className="text-sm font-medium text-gray-800">
                  {t('dashboard.markReady.smsCountdownSubtitle', {
                    customerName: order.customerName,
                    count: countdown,
                    plural,
                  })}
                </p>
                <p className="text-xs text-gray-500">{order.phone}</p>
              </div>
            </div>
            <Button
              variant="outline"
              onClick={handleCancelSms}
              className="w-full h-11 border-red-300 text-red-600 hover:bg-red-50 hover:border-red-400 font-semibold"
            >
              {t('dashboard.markReady.smsCancelButton')}
            </Button>
          </div>
        ) : (
          /* step === 'sending' */
          <div className="flex flex-col items-center gap-4 py-8">
            <Loader2 className="w-10 h-10 text-[#3B4BFF] animate-spin" />
            <p className="text-sm text-gray-600">
              {t('dashboard.markReady.smsSendingSubtitle', { customerName: order.customerName })}
            </p>
          </div>
        )}
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
    if (isOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedType(templateType);
    }
    // Solo resincroniza al abrir el modal (o si cambia el templateType de
    // origen); `selectedType` se excluye a propósito para no pisar la
    // selección manual del usuario en cada clic.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, templateType]);

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
                <code className="font-mono">VITE_SUPABASE_URL</code> /{' '}
                <code className="font-mono">send-reminder-sms</code>.
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

/* ---------- Modal: Notificar cliente (ORDER_PROCESSED) ---------- */

interface OrderProcessedModalProps {
  order: Order | null;
  isOpen: boolean;
  onClose: () => void;
  onSent: () => void;
  operatorId: string;
}

function OrderProcessedModal({ order, isOpen, onClose, onSent, operatorId }: OrderProcessedModalProps) {
  const { t } = useI18n();
  const [isSending, setIsSending] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [noteEnabled, setNoteEnabled] = useState(false);
  const [customNote, setCustomNote] = useState('');
  const [omitDate, setOmitDate] = useState(false);
  const [usageTick, setUsageTick] = useState(0);

  // Reset al abrir/cerrar
  useEffect(() => {
    if (!isOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setNoteEnabled(false);
      setCustomNote('');
      setOmitDate(false);
      setErrorMsg(null);
      setIsSending(false);
    }
  }, [isOpen]);

  const errorToShow = isOpen ? errorMsg : null;

  const usage: SmsUsageStats = useMemo(() => {
    void isOpen;
    void usageTick;
    return getUsageStats();
  }, [isOpen, usageTick]);

  if (!order) return null;

  const activeNote = noteEnabled ? customNote.trim() : undefined;
  const activeOmitDate = noteEnabled && omitDate;
  const message = previewMessage(order, 'ORDER_PROCESSED', activeNote, activeOmitDate);
  const segments = estimateSmsSegments(message);
  const ready = isTwilioReady();

  const handleSend = async () => {
    if (isSending) return;
    setIsSending(true);
    setErrorMsg(null);

    const result = await notifySmsTemplate({
      order,
      operatorId,
      type: 'ORDER_PROCESSED',
      daysReady: null,
      customNote: activeNote,
      omitEstimatedDate: activeOmitDate,
    });

    setIsSending(false);
    setUsageTick((n) => n + 1);

    if (result.ok) {
      toast.success(t('dashboard.orderProcessed.sent'), {
        description: `#${orderTicketLabel(order)} — ${order.customerName}`,
      });
      onSent();
      onClose();
      return;
    }

    setErrorMsg(result.errorMessage ?? t('dashboard.orderProcessed.failed'));
    toast.error(t('dashboard.orderProcessed.failed'), {
      description: result.errorMessage ?? t('dashboard.notify.failedDescription'),
    });
  };

  // Hint contextual según el modo activo
  const modeHint = activeOmitDate
    ? t('dashboard.orderProcessed.hintNoDate')
    : activeNote
    ? t('dashboard.orderProcessed.hintNote')
    : t('dashboard.orderProcessed.hintBase');

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !isSending && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold text-[#1B2A4A] flex items-center gap-2">
            <MessageSquarePlus className="w-5 h-5 text-[#3B4BFF]" />
            {t('dashboard.orderProcessed.title')}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Info orden */}
          <div className="bg-slate-50 p-3 rounded-lg space-y-1">
            <p className="text-sm text-gray-600">
              {t('dashboard.orderProcessed.orderLabel')}{' '}
              <span className="font-semibold text-[#1B2A4A]">#{orderTicketLabel(order)}</span>
            </p>
            <p className="text-sm text-gray-600">
              {t('dashboard.orderProcessed.customerLabel')}{' '}
              <span className="font-medium">{order.customerName}</span>
            </p>
            <p className="text-sm text-gray-600">
              {t('dashboard.orderProcessed.phoneLabel')}{' '}
              <span className="font-mono">{order.phone}</span>
            </p>
          </div>

          {/* Toggle: agregar novedad */}
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => {
                setNoteEnabled((prev) => {
                  if (prev) { setOmitDate(false); setCustomNote(''); }
                  return !prev;
                });
              }}
              className={`w-full flex items-center justify-between px-4 py-2.5 rounded-lg border text-sm font-medium transition-colors ${
                noteEnabled
                  ? 'border-[#3B4BFF] bg-[#EEF2FF] text-[#3B4BFF]'
                  : 'border-gray-200 bg-white text-gray-700 hover:bg-slate-50'
              }`}
            >
              <span>{t('dashboard.orderProcessed.toggleNote')}</span>
              <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                noteEnabled ? 'border-[#3B4BFF] bg-[#3B4BFF]' : 'border-gray-300'
              }`}>
                {noteEnabled && <span className="w-2 h-2 rounded-full bg-white" />}
              </span>
            </button>

            {noteEnabled && (
              <div className="space-y-2 pl-1">
                <Label className="text-sm font-medium text-gray-700">
                  {t('dashboard.orderProcessed.noteLabel')}
                </Label>
                <textarea
                  value={customNote}
                  onChange={(e) => setCustomNote(e.target.value.slice(0, 100))}
                  placeholder={t('dashboard.orderProcessed.notePlaceholder')}
                  rows={2}
                  className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:outline-none focus:border-[#3B4BFF] focus:ring-1 focus:ring-[#3B4BFF] resize-none"
                />
                <p className={`text-xs text-right ${
                  customNote.length >= 100 ? 'text-red-500' : 'text-gray-400'
                }`}>
                  {t('dashboard.orderProcessed.noteChars', { count: customNote.length })}
                </p>

                {/* Toggle: sin fecha estimada (solo cuando hay nota) */}
                <button
                  type="button"
                  onClick={() => setOmitDate((prev) => !prev)}
                  className={`w-full flex items-center justify-between px-4 py-2.5 rounded-lg border text-sm font-medium transition-colors ${
                    omitDate
                      ? 'border-amber-400 bg-amber-50 text-amber-700'
                      : 'border-gray-200 bg-white text-gray-700 hover:bg-slate-50'
                  }`}
                >
                  <span>{t('dashboard.orderProcessed.toggleNoDate')}</span>
                  <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                    omitDate ? 'border-amber-500 bg-amber-500' : 'border-gray-300'
                  }`}>
                    {omitDate && <span className="w-2 h-2 rounded-full bg-white" />}
                  </span>
                </button>
              </div>
            )}
          </div>

          {/* Preview del mensaje */}
          <div className="space-y-2">
            <Label className="text-sm font-medium text-gray-700">
              {t('dashboard.orderProcessed.messageLabel')}
            </Label>
            <div className="rounded-lg border border-gray-200 bg-white p-3 text-sm text-gray-800 whitespace-pre-wrap">
              {message}
            </div>
            <div className="flex items-center justify-between text-xs text-gray-500">
              <span>{t('dashboard.orderProcessed.messageLength', { count: message.length })}</span>
              <span>{t('dashboard.orderProcessed.messageSegments', { count: segments, plural: segments !== 1 ? 's' : '' })}</span>
            </div>
            <p className="text-xs text-gray-500 italic">{modeHint}</p>
          </div>

          {/* Stats de uso */}
          <div className="rounded-lg border border-gray-200 bg-slate-50 p-3 text-xs text-gray-600 space-y-1">
            <div className="flex items-center justify-between">
              <span>{t('dashboard.notify.modeLabel')}</span>
              <span className="font-medium">
                {usage.mockMode ? t('dashboard.notify.mockMode') : t('dashboard.notify.productionMode')}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>{t('dashboard.notify.smsLastMinute')}</span>
              <span className="font-medium">{usage.sentLastMinute} / {usage.globalPerMinuteCap}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>{t('dashboard.notify.remainingBudget')}</span>
              <span className="font-medium">{usage.remainingDailyBudget}</span>
            </div>
          </div>

          {!ready && !usage.mockMode && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800 flex gap-2">
              <ShieldAlert className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <p>{t('dashboard.notify.twilioNotConfigured')} <code className="font-mono">VITE_SUPABASE_URL</code></p>
            </div>
          )}

          {errorToShow && (
            <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800 flex gap-2">
              <ShieldAlert className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <p>{errorToShow}</p>
            </div>
          )}

          <Button
            onClick={() => void handleSend()}
            disabled={isSending || (!ready && !usage.mockMode) || usage.killSwitch}
            className="w-full h-11 bg-[#3B4BFF] hover:bg-[#2F3DE6] text-white font-semibold disabled:opacity-50"
          >
            {isSending ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" />{t('dashboard.orderProcessed.sending')}</>
            ) : (
              <><Send className="w-4 h-4 mr-2" />{t('dashboard.orderProcessed.sendButton')}</>
            )}
          </Button>

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

function SettingsModal({
  isOpen,
  pendingAutoRefresh,
  onPendingAutoRefreshChange,
  onClose,
  onSave,
}: {
  isOpen: boolean;
  pendingAutoRefresh: boolean;
  onPendingAutoRefreshChange: (value: boolean) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  const { t } = useI18n();

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="w-full max-w-full sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold text-[#1B2A4A]">
            {t('dashboard.config.title')}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <p className="text-sm text-gray-600">{t('dashboard.config.description')}</p>

          <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
            <p className="text-sm font-semibold text-gray-900">{t('dashboard.config.section.behavior')}</p>
            <p className="text-sm text-gray-500 mb-4">{t('dashboard.config.section.behaviorDescription')}</p>
            <label className="flex items-center gap-3 rounded-lg border border-gray-200 bg-slate-50 px-4 py-3 cursor-pointer">
              <input
                type="checkbox"
                checked={pendingAutoRefresh}
                onChange={(event) => onPendingAutoRefreshChange(event.target.checked)}
                className="h-4 w-4 text-[#3B4BFF]"
              />
              <div>
                <p className="font-medium text-gray-900">{t('dashboard.config.autoRefreshLabel')}</p>
                <p className="text-sm text-gray-500">{t('dashboard.config.autoRefreshDescription')}</p>
              </div>
            </label>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose} className="h-11">
              {t('common.cancel')}
            </Button>
            <Button onClick={onSave} className="h-11 bg-[#3B4BFF] hover:bg-[#2F3DE6] text-white">
              {t('dashboard.config.save')}
            </Button>
          </div>
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

/* ---------- Order notes indicator ---------- */

/** Shared notes-tooltip for both desktop table rows and mobile cards.
 *  Uses a portal to avoid clipping from overflow-hidden table containers.
 *  Click toggles showing the full note text. */
function OrderNotesIndicator({
  order,
  variant,
}: {
  order: Order;
  variant: 'desktop' | 'mobile';
}) {
  const { t } = useI18n();
  const label = `#${orderTicketLabel(order)}`;
  const [isOpen, setIsOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  if (!order.notes) return <>{label}</>;

  const updatePosition = useCallback(() => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const tooltipWidth = variant === 'desktop' ? 280 : 240;
    let left: number;
    if (variant === 'desktop') {
      // Center above the button
      left = rect.left + rect.width / 2 - tooltipWidth / 2;
    } else {
      // Align to the left edge
      left = rect.left;
    }
    // Clamp so it doesn't go off-screen
    left = Math.max(8, Math.min(left, window.innerWidth - tooltipWidth - 8));
    setPos({ top: rect.top - 8, left });
  }, [variant]);

  // Close on outside click or scroll
  useEffect(() => {
    if (!isOpen) return;
    updatePosition();

    const handleClose = (e: MouseEvent) => {
      if (
        tooltipRef.current && !tooltipRef.current.contains(e.target as Node) &&
        buttonRef.current && !buttonRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    const handleScroll = () => setIsOpen(false);

    document.addEventListener('mousedown', handleClose);
    document.addEventListener('scroll', handleScroll, true);
    return () => {
      document.removeEventListener('mousedown', handleClose);
      document.removeEventListener('scroll', handleScroll, true);
    };
  }, [isOpen, updatePosition]);

  const maxW = variant === 'desktop' ? 280 : 240;

  return (
    <>
      <span className="relative inline-flex group">
        <button
          ref={buttonRef}
          type="button"
          className="inline-flex items-center gap-1 cursor-default focus:outline-none"
          onClick={() => setIsOpen((v) => !v)}
        >
          {label}
          <StickyNote className="w-3 h-3 text-amber-500 opacity-60 group-hover:opacity-100 transition-opacity" />
        </button>
      </span>
      {isOpen && pos && createPortal(
        <div
          ref={tooltipRef}
          className="fixed rounded-md bg-slate-900 px-3 py-2 text-xs text-white whitespace-normal text-left shadow-lg animate-in fade-in duration-150"
          style={{
            top: pos.top,
            left: pos.left,
            maxWidth: maxW,
            transform: 'translateY(-100%)',
            zIndex: 9999,
          }}
        >
          {order.notes}
          <button
            type="button"
            className="block mt-1 text-[10px] text-slate-400 hover:text-slate-200 transition-colors"
            onClick={() => setIsOpen(false)}
          >
            {t('common.close')}
          </button>
        </div>,
        document.body
      )}
    </>
  );
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
  const { logout, session } = useAuth();
  const currentOperatorId = session?.user?.id ?? '';
  const {
    orders,
    updateOrderStatus,
    page,
    totalPages,
    goToPage,
    isLoading,
    viewMode,
    setViewMode,
    autoRefreshAfterStatusChange,
    setAutoRefreshAfterStatusChange,
  } = useOrders();
  const { t } = useI18n();
  const [searchQuery, setSearchQuery] = useState('');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const filterMenuRef = useRef<HTMLDivElement | null>(null);
  const [pendingAutoRefresh, setPendingAutoRefresh] = useState<boolean>(autoRefreshAfterStatusChange);

  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [isReadyModalOpen, setIsReadyModalOpen] = useState(false);

  const [notifyOrder, setNotifyOrder] = useState<Order | null>(null);
  const [isNotifyModalOpen, setIsNotifyModalOpen] = useState(false);
  const [notifyTemplateType, setNotifyTemplateType] = useState<NotificationEventType>('ORDER_READY');
  const [notifyDaysReady, setNotifyDaysReady] = useState<number | null>(null);

  const [processedOrder, setProcessedOrder] = useState<Order | null>(null);
  const [isProcessedModalOpen, setIsProcessedModalOpen] = useState(false);

  // Tick que se incrementa cuando se completa un envío para refrescar el set
  // de órdenes ya notificadas (lectura desde localStorage).
  const [historyTick, setHistoryTick] = useState(0);
  const viewModeOptions = [
    {
      value: 'ACTIVE' as OrdersViewMode,
      label: t('dashboard.config.mode.active'),
      description: t('dashboard.config.mode.activeDescription'),
    },
    {
      value: 'PENDING' as OrdersViewMode,
      label: t('dashboard.config.mode.pending'),
      description: t('dashboard.config.mode.pendingDescription'),
    },
    {
      value: 'READY' as OrdersViewMode,
      label: t('dashboard.config.mode.ready'),
      description: t('dashboard.config.mode.readyDescription'),
    },
    {
      value: 'DELIVERED' as OrdersViewMode,
      label: t('dashboard.config.mode.delivered'),
      description: t('dashboard.config.mode.deliveredDescription'),
    },
  ];

  const notifiedReadyIds = useNotifiedOrderIdsByType('ORDER_READY', historyTick);
  const notifiedReminderIds = useNotifiedOrderIdsByType('PICKUP_REMINDER', historyTick);
  const notifiedProcessedIds = useNotifiedOrderIdsByType('ORDER_PROCESSED', historyTick);

  const filteredOrders = useMemo(() => {
    if (!searchQuery.trim()) return orders;
    const query = searchQuery.toLowerCase();
    return orders.filter((order) => {
      const ticket = orderTicketLabel(order);
      return (
        order.phone.toLowerCase().includes(query) ||
        order.customerName.toLowerCase().includes(query) ||
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

  const validateRackAssignment = async (rackNumber: string): Promise<string | null> => {
    if (!selectedOrder) return null;
    const conflictingOrder = await fetchRackConflict(selectedOrder.id, rackNumber);

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

  const handleConfirmReady = async (rackNumber: string): Promise<boolean> => {
    if (!selectedOrder) return false;
    // El modal espera esta promesa antes de iniciar el countdown del SMS,
    // para no notificar con un estado que todavía no se guardó.
    const persisted = await updateOrderStatus(selectedOrder.id, 'LISTO', rackNumber);
    if (persisted) {
      // selectedOrder es una referencia congelada tomada al abrir el modal;
      // sin esto, el SMS se manda con status/rackNumber viejos y el guard
      // de checkOrderState lo rechaza como "no está LISTA".
      setSelectedOrder((prev) =>
        prev ? { ...prev, status: 'LISTO', rackNumber, daysReady: 0 } : prev
      );
    }
    return persisted;
  };

  const handleSendReadySms = async (order: Order) => {
    const result = await notifySmsTemplate({
      order,
      operatorId: currentOperatorId,
      type: 'ORDER_READY',
      daysReady: null,
    });
    if (result.ok) {
      toast.success(t('dashboard.notify.sentSms'), {
        description: `#${orderTicketLabel(order)} — ${order.customerName}`,
      });
      handleNotified();
    } else {
      toast.error(t('dashboard.notify.failedSms'), {
        description: result.errorMessage ?? t('dashboard.notify.failedDescription'),
      });
    }
  };

  const handleMarkDelivered = (order: Order) => {
    updateOrderStatus(order.id, 'ENTREGADO');
    toast.success(t('dashboard.delivery.willNotify'), {
      description: t('dashboard.delivery.willNotifyDescription'),
      action: {
        label: t('dashboard.delivery.revert'),
        onClick: () => handleRevertToReady(order.id),
      },
      duration: 5000,
    });
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

  const handleOpenProcessed = (order: Order) => {
    setProcessedOrder(order);
    setIsProcessedModalOpen(true);
  };

  const handleProcessedNotified = () => {
    setHistoryTick((t) => t + 1);
  };

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (!filterMenuRef.current?.contains(event.target as Node)) {
        setIsFilterOpen(false);
      }
    };

    if (isFilterOpen) {
      window.addEventListener('mousedown', handleOutsideClick);
      return () => window.removeEventListener('mousedown', handleOutsideClick);
    }

    return undefined;
  }, [isFilterOpen]);

  const handleRevertToReceived = (orderId: string) => {
    updateOrderStatus(orderId, 'RECIBIDO');
    toast.success(t('dashboard.status.revertedReceived'));
  };

  const handleRevertToReady = (orderId: string) => {
    updateOrderStatus(orderId, 'LISTO');
    toast.success(t('dashboard.status.revertedReady'));
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <ReminderTaskHandler />
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
                {t('dashboard.header.currentLocation')} <span className="ml-2 font-semibold text-white">Ortega Cleaners</span>
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
          <div className="ml-4 flex-shrink-0 flex items-center gap-2">
            <div ref={filterMenuRef} className="relative">
              <Button
                size="icon-sm"
                variant="outline"
                onClick={() => setIsFilterOpen((current) => !current)}
                title={t('dashboard.filter.open')}
                aria-label={t('dashboard.filter.open')}
              >
                <Funnel className="w-4 h-4" />
              </Button>

              {isFilterOpen ? (
                <div className="absolute right-0 z-20 mt-2 w-72 rounded-2xl border border-gray-200 bg-white p-3 shadow-lg">
                  <p className="text-sm font-semibold text-slate-900 mb-2">{t('dashboard.filter.title')}</p>
                  <div className="space-y-2">
                    {viewModeOptions.map((option) => (
                      <label
                        key={option.value}
                        className="flex items-start gap-3 rounded-xl border border-gray-200 p-3 hover:border-slate-300 cursor-pointer"
                      >
                        <input
                          type="radio"
                          name="dashboardFilterMode"
                          value={option.value}
                          checked={viewMode === option.value}
                          onChange={() => {
                            setViewMode(option.value);
                            setIsFilterOpen(false);
                          }}
                          className="mt-1 h-4 w-4 text-[#3B4BFF]"
                        />
                        <div className="min-w-0">
                          <p className="font-medium text-gray-900">{option.label}</p>
                          <p className="text-sm text-gray-500">{option.description}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            <Button
              size="icon-sm"
              variant="outline"
              onClick={() => {
                setPendingAutoRefresh(autoRefreshAfterStatusChange);
                setIsSettingsOpen(true);
              }}
              title={t('dashboard.config.open')}
              aria-label={t('dashboard.config.open')}
            >
              <Settings className="w-4 h-4" />
            </Button>

            <Button onClick={() => navigate('/dashboard/nueva')} className="rounded-full px-4 py-2">
              <Plus className="w-4 h-4 mr-2" />
              {t('dashboard.newOrder')}
            </Button>
          </div>
        </div>

        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 text-sm text-gray-500">
          <span>{t('dashboard.config.currentModeLabel')}</span>
          <span className="font-medium text-slate-700">{t(`dashboard.config.mode.${viewMode.toLowerCase()}`)}</span>
        </div>

        <div className="mb-4 flex items-center justify-between text-sm text-gray-500">
          <span>{isLoading ? 'Cargando órdenes...' : `Página ${page} de ${totalPages}`}</span>
          <span>{orders.length} órdenes activas</span>
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
            <>
            <div className="hidden md:block overflow-x-auto">
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
                    const templateType: NotificationEventType = isReminder ? 'PICKUP_REMINDER' : 'ORDER_READY';
                    const alreadyNotified = isReminder
                      ? notifiedReminderIds.has(order.id)
                      : notifiedReadyIds.has(order.id);
                    const notifyLabel = isReminder ? t('dashboard.actions.reminder') : t('dashboard.actions.notifyCustomer');
                    return (
                      <TableRow key={order.id} className="hover:bg-[#FFF4E6]">
                        <TableCell className="font-medium text-[#1B2A4A]">
                          <OrderNotesIndicator order={order} variant="desktop" />
                        </TableCell>
                        <TableCell>{order.customerName}</TableCell>
                        <TableCell className="text-gray-600">{order.phone}</TableCell>
                        <TableCell className="text-gray-600">{order.estimatedDate}</TableCell>
                        <TableCell><StatusBadge order={order} /></TableCell>
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
                                {t('dashboard.actions.copyTrackingTooltipWithDate', { date: order.estimatedDate ?? '' })}
                              </span>
                            </span>
                            {(order.status === 'RECIBIDO' || order.status === 'EN PROCESO') && (
                              <span className="relative inline-flex group">
                                <Button
                                  size="sm"
                                  onClick={() => handleMarkReady(order)}
                                  className="bg-[#3B4BFF] hover:bg-[#2F3DE6] text-white text-xs font-semibold"
                                >
                                  {t('dashboard.actions.markReady')}
                                </Button>
                                <span className="pointer-events-none absolute left-1/2 bottom-full mb-2 -translate-x-1/2 rounded-md bg-slate-900 px-2 py-1 text-xs text-white opacity-0 transition-opacity duration-150 group-hover:opacity-100">
                                  {t('dashboard.actions.markReady')}
                                </span>
                              </span>
                            )}
                            {(order.status === 'RECIBIDO' || order.status === 'EN PROCESO') && !notifiedProcessedIds.has(order.id) && (
                              <span className="relative inline-flex group">
                                <Button
                                  size="sm"
                                  onClick={() => handleOpenProcessed(order)}
                                  className="bg-[#EEF2FF] hover:bg-[#E0E7FF] text-[#3B4BFF] text-xs font-semibold"
                                >
                                  {t('dashboard.actions.notifyCustomer')}
                                </Button>
                                <span className="pointer-events-none absolute left-1/2 bottom-full mb-2 -translate-x-1/2 rounded-md bg-slate-900 px-2 py-1 text-xs text-white opacity-0 transition-opacity duration-150 group-hover:opacity-100 whitespace-nowrap">
                                  {t('dashboard.orderProcessed.title')}
                                </span>
                              </span>
                            )}
                            {order.status === 'LISTO' && !alreadyNotified && (
                              <span className="relative inline-flex group">
                                <Button
                                  size="sm"
                                  onClick={() => handleOpenNotify(order, templateType, daysReady)}
                                  className="bg-[#FFF4E6] hover:bg-[#FFF1DA] text-[#0E0E1A] text-xs font-semibold"
                                >
                                  {notifyLabel}
                                </Button>
                                <span className="pointer-events-none absolute left-1/2 bottom-full mb-2 -translate-x-1/2 rounded-md bg-slate-900 px-2 py-1 text-xs text-white opacity-0 transition-opacity duration-150 group-hover:opacity-100">
                                  {templateType === 'ORDER_READY' ? t('dashboard.actions.notifyCustomerTooltip') : t('dashboard.actions.reminderTooltip')}
                                </span>
                              </span>
                            )}
                            {order.status === 'LISTO' && (
                              <span className="relative inline-flex group">
                                <Button
                                  size="sm"
                                  onClick={() => handleMarkDelivered(order)}
                                  className="bg-[#E6FAF1] hover:bg-[#D7F5E8] text-[#047857] text-xs font-semibold"
                                >
                                  {t('dashboard.actions.markDelivered')}
                                </Button>
                                <span className="pointer-events-none absolute left-1/2 bottom-full mb-2 -translate-x-1/2 rounded-md bg-slate-900 px-2 py-1 text-xs text-white opacity-0 transition-opacity duration-150 group-hover:opacity-100">
                                  {t('dashboard.actions.markDeliveredTooltip')}
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
                                  aria-label={t('dashboard.actions.revert')}
                                >
                                  <Undo className="w-3.5 h-3.5" />
                                </Button>
                                <span className="pointer-events-none absolute left-1/2 bottom-full mb-2 -translate-x-1/2 rounded-md bg-slate-900 px-2 py-1 text-xs text-white opacity-0 transition-opacity duration-150 group-hover:opacity-100">
                                  {t('dashboard.actions.revert')}
                                </span>
                              </span>
                            )}
                            {(order.status === 'ENTREGADO' || order.status === 'ABANDONADO') && (
                              <span className="relative inline-flex group">
                                <Button
                                  size="icon-sm"
                                  variant="outline"
                                  onClick={() => handleRevertToReady(order.id)}
                                  className="border-gray-300 text-gray-600 hover:bg-gray-50"
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
            <div className="md:hidden space-y-3 px-4 py-3">
              {filteredOrders.map((order) => {
                const daysReady = resolveDaysReady(order);
                const isReminder = typeof daysReady === 'number' && daysReady >= REMINDER_DAYS;
                const templateType: NotificationEventType = isReminder ? 'PICKUP_REMINDER' : 'ORDER_READY';
                const alreadyNotified = isReminder
                  ? notifiedReminderIds.has(order.id)
                  : notifiedReadyIds.has(order.id);
                const notifyLabel = isReminder ? t('dashboard.actions.reminder') : t('dashboard.actions.notifyCustomer');
                return (
                  <div key={order.id} className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900">
                          <OrderNotesIndicator order={order} variant="mobile" />
                        </p>
                        <p className="text-sm text-gray-600 truncate">{order.customerName} · {order.phone}</p>
                        <p className="text-xs text-gray-500 mt-1">{order.estimatedDate}</p>
                      </div>
                      <StatusBadge order={order} />
                    </div>
                    <div className="mt-4 grid gap-2 sm:grid-cols-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleCopyTrackingLink(order)}
                        className="w-full"
                      >
                        {t('dashboard.actions.copyTrackingLabel')}
                      </Button>
                      {(order.status === 'RECIBIDO' || order.status === 'EN PROCESO') && (
                        <Button
                          size="sm"
                          onClick={() => handleMarkReady(order)}
                          className="w-full bg-[#3B4BFF] hover:bg-[#2F3DE6] text-white"
                        >
                          {t('dashboard.actions.markReady')}
                        </Button>
                      )}
                      {(order.status === 'RECIBIDO' || order.status === 'EN PROCESO') && !notifiedProcessedIds.has(order.id) && (
                        <Button
                          size="sm"
                          onClick={() => handleOpenProcessed(order)}
                          className="w-full bg-[#EEF2FF] text-[#3B4BFF] hover:bg-[#E0E7FF] text-xs font-semibold"
                        >
                          {t('dashboard.actions.notifyCustomer')}
                        </Button>
                      )}
                      {order.status === 'LISTO' && !alreadyNotified && (
                        <Button
                          size="sm"
                          onClick={() => handleOpenNotify(order, templateType, daysReady)}
                          className="w-full bg-[#FFF4E6] text-[#0E0E1A] hover:bg-[#F7E8CD]"
                        >
                          {notifyLabel}
                        </Button>
                      )}
                      {order.status === 'LISTO' && (
                        <Button
                          size="sm"
                          onClick={() => handleMarkDelivered(order)}
                          className="w-full bg-[#E6FAF1] text-[#047857] hover:bg-[#D7F5E8]"
                        >
                          {t('dashboard.actions.markDelivered')}
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-gray-200 px-4 py-3 text-sm">
              <Button
                variant="outline"
                onClick={() => goToPage(Math.max(1, page - 1))}
                disabled={page <= 1 || isLoading}
              >
                Anterior
              </Button>
              <span className="text-gray-600">
                Página {page} de {totalPages}
              </span>
              <Button
                variant="outline"
                onClick={() => goToPage(Math.min(totalPages, page + 1))}
                disabled={page >= totalPages || isLoading}
              >
                Siguiente
              </Button>
            </div>
            </>
          )}
        </div>
      </main>

      <footer className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-6">
        <div className="border-t border-gray-200 pt-4 flex items-center justify-between gap-4 text-sm text-gray-600">
          <p className="truncate">{t('dashboard.footer.message')}</p>
          <p className="inline-flex items-center gap-1 text-gray-500 whitespace-nowrap">
            <Zap className="w-4 h-4 text-[#3B4BFF]" />
            {t('dashboard.footer.poweredBy')}
          </p>
        </div>
      </footer>

      <SettingsModal
        isOpen={isSettingsOpen}
        pendingAutoRefresh={pendingAutoRefresh}
        onPendingAutoRefreshChange={setPendingAutoRefresh}
        onClose={() => setIsSettingsOpen(false)}
        onSave={() => {
          setAutoRefreshAfterStatusChange(pendingAutoRefresh);
          setIsSettingsOpen(false);
        }}
      />

      <MarkReadyModal
        order={selectedOrder}
        isOpen={isReadyModalOpen}
        onClose={() => {
          setIsReadyModalOpen(false);
          setSelectedOrder(null);
        }}
        onConfirm={handleConfirmReady}
        onSendSms={handleSendReadySms}
        validateRackNumber={validateRackAssignment}
      />

      <NotifyCustomerModal
        order={notifyOrder}
        isOpen={isNotifyModalOpen}
        onClose={() => setIsNotifyModalOpen(false)}
        onSent={handleNotified}
        operatorId={currentOperatorId}
        templateType={notifyTemplateType}
        daysReady={notifyDaysReady}
      />

      <OrderProcessedModal
        order={processedOrder}
        isOpen={isProcessedModalOpen}
        onClose={() => {
          setIsProcessedModalOpen(false);
          setProcessedOrder(null);
        }}
        onSent={handleProcessedNotified}
        operatorId={currentOperatorId}
      />
    </div>
  );
}
