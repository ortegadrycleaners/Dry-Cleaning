import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthContext';
import { useOrders } from '@/context/OrdersContext';
import type { Order } from '@/types';
import { orderTicketLabel } from '@/lib/utils';
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
import {
  notifyOrderReady,
  previewMessage,
  estimateSmsSegments,
  getUsageStats,
  getSmsHistory,
  isTwilioReady,
  type SmsUsageStats,
} from '@/services/twilio';

/* ---------- Modal: Marcar Listo (sólo cambia estado, no envía SMS) ---------- */

interface MarkReadyModalProps {
  order: Order | null;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (rackNumber: string) => void;
}

function MarkReadyModal({ order, isOpen, onClose, onConfirm }: MarkReadyModalProps) {
  const [rackNumber, setRackNumber] = useState('');
  const [error, setError] = useState('');

  const handleConfirm = () => {
    if (!rackNumber.trim()) {
      setError('El número de rack es requerido');
      return;
    }
    onConfirm(rackNumber.trim());
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
            Marcar Orden como Lista
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="bg-slate-50 p-3 rounded-lg">
            <p className="text-sm text-gray-600">
              Orden{' '}
              <span className="font-semibold text-[#1B2A4A]">
                #{orderTicketLabel(order)}
              </span>
            </p>
            <p className="text-sm text-gray-600">
              Cliente: <span className="font-medium">{order.customerName}</span>
            </p>
          </div>
          <div className="space-y-2">
            <Label
              htmlFor="rackNumber"
              className="text-sm font-medium text-gray-700"
            >
              Número de Rack
            </Label>
            <Input
              id="rackNumber"
              type="text"
              placeholder="Ej. 14"
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
            Confirmar (sin enviar SMS)
          </Button>
          <p className="text-xs text-center text-gray-500">
            El SMS NO se envía aquí. Tras marcar la orden como lista, usa el
            botón <strong>“Notificar al cliente”</strong>.
          </p>
          <Button
            variant="ghost"
            onClick={handleClose}
            className="w-full h-10 text-gray-500 hover:text-gray-700"
          >
            Cancelar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ---------- Modal: Notificar al cliente (único disparador de SMS) ---------- */

interface NotifyCustomerModalProps {
  order: Order | null;
  isOpen: boolean;
  onClose: () => void;
  onSent: () => void;
  operatorId: string;
}

function NotifyCustomerModal({
  order,
  isOpen,
  onClose,
  onSent,
  operatorId,
}: NotifyCustomerModalProps) {
  const [isSending, setIsSending] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  // Tick incremental: cada apertura del modal y cada envío refresca usage
  // sin caer en setState-dentro-de-useEffect.
  const [usageTick, setUsageTick] = useState(0);

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

  const message = previewMessage(order, 'ORDER_READY');
  const segments = estimateSmsSegments(message);
  const ready = isTwilioReady();

  const handleSend = async () => {
    if (isSending) return;
    setIsSending(true);
    setErrorMsg(null);

    const result = await notifyOrderReady({ order, operatorId });

    setIsSending(false);
    setUsageTick((t) => t + 1);

    if (result.ok) {
      toast.success('SMS enviado al cliente', {
        description: `#${order.orderNumber} — ${order.customerName}`,
      });
      onSent();
      onClose();
      return;
    }

    setErrorMsg(result.errorMessage ?? 'No se pudo enviar el SMS.');
    toast.error('No se envió el SMS', {
      description: result.errorMessage ?? 'Revisa los detalles en el modal.',
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !isSending && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold text-[#1B2A4A] flex items-center gap-2">
            <Send className="w-5 h-5 text-[#C9A84C]" />
            Notificar al cliente
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div className="bg-slate-50 p-3 rounded-lg space-y-1">
            <p className="text-sm text-gray-600">
              Orden{' '}
              <span className="font-semibold text-[#1B2A4A]">
                #{orderTicketLabel(order)}
              </span>
            </p>
            <p className="text-sm text-gray-600">
              Cliente: <span className="font-medium">{order.customerName}</span>
            </p>
            <p className="text-sm text-gray-600">
              Teléfono destino:{' '}
              <span className="font-mono">{order.phone}</span>
            </p>
            {order.rackNumber && (
              <p className="text-sm text-gray-600">
                Rack: <span className="font-medium">#{order.rackNumber}</span>
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium text-gray-700">
              Mensaje a enviar (plantilla sellada — no editable)
            </Label>
            <div className="rounded-lg border border-gray-200 bg-white p-3 text-sm text-gray-800 whitespace-pre-wrap">
              {message}
            </div>
            <div className="flex items-center justify-between text-xs text-gray-500">
              <span>{message.length} caracteres</span>
              <span>
                {segments} segmento{segments !== 1 ? 's' : ''} SMS facturable
                {segments !== 1 ? 's' : ''}
              </span>
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 bg-slate-50 p-3 text-xs text-gray-600 space-y-1">
            <div className="flex items-center justify-between">
              <span>Modo:</span>
              <span className="font-medium">
                {usage.mockMode ? 'MOCK (no envía a Twilio)' : 'PRODUCCIÓN'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>SMS último minuto:</span>
              <span className="font-medium">
                {usage.sentLastMinute} / {usage.globalPerMinuteCap}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>SMS últimas 24h:</span>
              <span className="font-medium">
                {usage.sentLastDay} / {usage.dailyBudget}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>Presupuesto restante hoy:</span>
              <span className="font-medium">{usage.remainingDailyBudget}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Kill switch:</span>
              <span
                className={`font-medium ${usage.killSwitch ? 'text-red-600' : 'text-green-600'}`}
              >
                {usage.killSwitch ? 'ACTIVO' : 'inactivo'}
              </span>
            </div>
          </div>

          {!ready && !usage.mockMode && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800 flex gap-2">
              <ShieldAlert className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <p>
                Twilio no está configurado. Define{' '}
                <code className="font-mono">VITE_NOTIFY_ENDPOINT_URL</code> o
                ejecuta en modo mock. Ver <strong>TWILIO_SETUP.md</strong>.
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
                Enviando…
              </>
            ) : (
              <>
                <Send className="w-4 h-4 mr-2" />
                Confirmar y enviar SMS
              </>
            )}
          </Button>

          <p className="text-[11px] text-center text-gray-500 leading-snug">
            Acción auditable. Se aplicarán en este orden: kill switch, validación de
            estado y teléfono, cooldown anti doble-click, dedup por orden,
            rate-limit por orden / por minuto y presupuesto diario. Reintentos
            usan idempotency key para no duplicar cargos en Twilio.
          </p>

          <Button
            variant="ghost"
            onClick={onClose}
            disabled={isSending}
            className="w-full h-10 text-gray-500 hover:text-gray-700"
          >
            Cancelar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ---------- Helper: ¿esta orden ya fue notificada? ---------- */

function useNotifiedOrderIds(refreshTick: number): Set<string> {
  return useMemo(() => {
    const ids = new Set<string>();
    for (const r of getSmsHistory()) {
      if (r.templateType === 'ORDER_READY') ids.add(r.orderId);
    }
    return ids;
    // refreshTick fuerza recomputo cuando se envía un SMS nuevo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshTick]);
}

/* ---------- Status badge ---------- */

function StatusBadge({ order }: { order: Order }) {
  const { status, daysReady } = order;

  if (status === 'ENTREGADO') {
    return (
      <span
        className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold"
        style={{ backgroundColor: '#F3F4F6', color: '#374151', border: '1px solid #E8E8F0' }}
      >
        <CheckCircle2 className="w-3 h-3 mr-1 text-[#6B7280]" />
        ENTREGADO
      </span>
    );
  }

  if (status === 'LISTO' && daysReady && daysReady >= 2) {
    return (
      <span
        className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold"
        style={{ backgroundColor: '#E6FAF1', color: '#047857', border: '1px solid #CFF0E3' }}
      >
        <AlertTriangle className="w-3 h-3 mr-1 text-[#047857]" />
        LISTO ⚠️ {daysReady} {daysReady === 1 ? 'día' : 'días'}{order.rackNumber ? ` · RACK ${order.rackNumber}` : ''}
      </span>
    );
  }

  if (status === 'LISTO') {
    return (
      <span
        className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold"
        style={{ backgroundColor: '#E6FAF1', color: '#047857', border: '1px solid #CFF0E3' }}
      >
        <CheckCircle2 className="w-3 h-3 mr-1 text-[#047857]" />
        {`LISTO${order.rackNumber ? ` · RACK ${order.rackNumber}` : ''}`}
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
        EN PROCESO
      </span>
    );
  }

  return (
    <span
      className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold"
      style={{ backgroundColor: '#FFF4E6', color: '#8B5E3C', border: '1px solid #F6E9DA' }}
    >
      <Package className="w-3 h-3 mr-1 text-[#8B5E3C]" />
      RECIBIDO
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

  // Tick que se incrementa cuando se completa un envío para refrescar el set
  // de órdenes ya notificadas (lectura desde localStorage).
  const [historyTick, setHistoryTick] = useState(0);
  const [pendingDelivery, setPendingDelivery] = useState<{ orderId: string; timeoutId: number } | null>(null);
  const notifiedOrderIds = useNotifiedOrderIds(historyTick);

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
      toast.success('Enlace de tracking copiado', {
        description: `#${order.orderNumber} — ${order.customerName}`,
      });
    } catch (error) {
      console.error('[DashboardPage] Copy tracking link failed:', error);
      toast.error('No se pudo copiar el enlace', {
        description: 'Verifica permisos del navegador.',
      });
    }
  };

  const handleMarkReady = (order: Order) => {
    setSelectedOrder(order);
    setIsReadyModalOpen(true);
  };

  const handleConfirmReady = (rackNumber: string) => {
    if (selectedOrder) {
      updateOrderStatus(selectedOrder.id, 'LISTO', rackNumber);
      toast.success('Orden marcada como LISTA', {
        description:
          'Para enviar el SMS al cliente, usa el botón “Notificar al cliente”.',
      });
    }
    setIsReadyModalOpen(false);
    setSelectedOrder(null);
  };

  const handleOpenNotify = (order: Order) => {
    setNotifyOrder(order);
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
      toast.success('Pedido marcado como ENTREGADO');
    }, 5000);

    setPendingDelivery({ orderId, timeoutId });

    toast.warning('Pedido marcado como entregado', {
      description: 'Se notificará al cliente en 5 segundos. Haz clic para revertir.',
      action: {
        label: 'Revertir',
        onClick: () => handleCancelDelivery(),
      },
      duration: 5000,
    });
  };

  const handleCancelDelivery = () => {
    if (pendingDelivery) {
      clearTimeout(pendingDelivery.timeoutId);
      setPendingDelivery(null);
      toast.success('Entrega cancelada');
    }
  };

  const handleRevertToReceived = (orderId: string) => {
    updateOrderStatus(orderId, 'RECIBIDO');
    toast.success('Orden revertida a RECIBIDO');
  };

  const handleRevertToReady = (orderId: string) => {
    updateOrderStatus(orderId, 'LISTO');
    toast.success('Orden revertida a LISTO');
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
                Estás en <span className="ml-2 font-semibold text-white">Ortega Dry Cleaners</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button onClick={() => navigate('/dashboard/nueva')} className="rounded-full px-4 py-2">
                <Plus className="w-4 h-4 mr-2" />
                Nueva Orden
              </Button>
              <NotificationsPanel />
              <button
                onClick={handleLogout}
                className="text-sm text-[#FAFAFC]/90 hover:text-white flex items-center gap-1 px-3 py-2 rounded-md hover:bg-white/5"
              >
                <LogOut className="w-4 h-4" />
                <span className="hidden sm:inline">Salir</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="mb-6">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              type="text"
              placeholder="Buscar por teléfono o nº de orden"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 h-11 border-gray-200 focus:border-[#3B4BFF] focus:ring-[#3B4BFF]"
            />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          {filteredOrders.length === 0 ? (
            <div className="p-12 text-center">
              <Package className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                No hay órdenes activas
              </h3>
              <p className="text-gray-500 mb-4">
                Crea una nueva orden para comenzar
              </p>
              <Button onClick={() => navigate('/dashboard/nueva')} className="rounded-full px-4 py-2">
                <Plus className="w-4 h-4 mr-2" />
                Nueva Orden
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50">
                    <TableHead className="font-semibold text-gray-700">Nº orden</TableHead>
                    <TableHead className="font-semibold text-gray-700">Cliente</TableHead>
                    <TableHead className="font-semibold text-gray-700">Teléfono</TableHead>
                    <TableHead className="font-semibold text-gray-700">Fecha Estimada</TableHead>
                    <TableHead className="font-semibold text-gray-700">Estado</TableHead>
                    <TableHead className="font-semibold text-gray-700">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredOrders.map((order) => {
                    const alreadyNotified = notifiedOrderIds.has(order.id);
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
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleCopyTrackingLink(order)}
                              className="text-xs border-gray-300 text-gray-600 hover:bg-gray-50"
                            >
                              <Link className="w-3.5 h-3.5 mr-1" />
                              Copiar tracking
                            </Button>
                            {(order.status === 'RECIBIDO' || order.status === 'EN PROCESO') && (
                              <span className="relative inline-flex group">
                                <Button
                                  size="sm"
                                  onClick={() => handleMarkReady(order)}
                                  className="bg-[#3B4BFF] hover:bg-[#2F3DE6] text-white text-xs font-semibold"
                                  title="Marcar la orden como lista"
                                >
                                  Marcar Listo
                                </Button>

                                <span className="pointer-events-none absolute left-1/2 bottom-full mb-2 -translate-x-1/2 rounded-md bg-slate-900 px-2 py-1 text-xs text-white opacity-0 transition-opacity duration-150 group-hover:opacity-100">
                                  Marcar la orden como lista
                                </span>
                              </span>
                            )}

                            {order.status === 'LISTO' && !alreadyNotified && (
                              <span className="relative inline-flex group">
                                  <Button
                                    size="sm"
                                    onClick={() => handleOpenNotify(order)}
                                    className="bg-[#FFF4E6] hover:bg-[#FFF1DA] text-[#0E0E1A] text-xs font-semibold"
                                    title="Notificar al cliente que su pedido está listo"
                                  >
                                    <Send className="w-3.5 h-3.5 mr-1 text-[#3B4BFF]" />
                                    Notificar al cliente
                                  </Button>

                                <span className="pointer-events-none absolute left-1/2 bottom-full mb-2 -translate-x-1/2 rounded-md bg-slate-900 px-2 py-1 text-xs text-white opacity-0 transition-opacity duration-150 group-hover:opacity-100">
                                  Notificar al cliente que su pedido está listo
                                </span>
                              </span>
                            )}

                            {order.status === 'LISTO' && alreadyNotified && (
                              <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-green-50 text-green-700 border border-green-200">
                                <ShieldCheck className="w-3.5 h-3.5 mr-1" />
                                Notificado
                              </span>
                            )}

                            {order.status === 'LISTO' && (
                              <span className="relative inline-flex group">
                                <Button
                                  size="sm"
                                  onClick={() => handleMarkDelivered(order.id)}
                                  disabled={pendingDelivery?.orderId === order.id}
                                  className="bg-green-600 hover:bg-green-700 text-white text-xs disabled:opacity-50"
                                  title="Marcar la orden como retirada por el cliente"
                                >
                                  {pendingDelivery?.orderId === order.id ? (
                                    <>
                                      <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                                      Procesando...
                                    </>
                                  ) : (
                                    'Entregado'
                                  )}
                                </Button>

                                <span className="pointer-events-none absolute left-1/2 bottom-full mb-2 -translate-x-1/2 rounded-md bg-slate-900 px-2 py-1 text-xs text-white opacity-0 transition-opacity duration-150 group-hover:opacity-100">
                                  Marcar la orden como retirada por el cliente
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
                                  title="Revertir"
                                  aria-label="Revertir"
                                >
                                  <Undo className="w-3.5 h-3.5" />
                                </Button>

                                <span className="pointer-events-none absolute left-1/2 bottom-full mb-2 -translate-x-1/2 rounded-md bg-slate-900 px-2 py-1 text-xs text-white opacity-0 transition-opacity duration-150 group-hover:opacity-100">
                                  Revertir
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
                                  title="Revertir"
                                  aria-label="Revertir"
                                >
                                  <Undo className="w-3.5 h-3.5" />
                                </Button>

                                <span className="pointer-events-none absolute left-1/2 bottom-full mb-2 -translate-x-1/2 rounded-md bg-slate-900 px-2 py-1 text-xs text-white opacity-0 transition-opacity duration-150 group-hover:opacity-100">
                                  Revertir
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
      />

      <NotifyCustomerModal
        order={notifyOrder}
        isOpen={isNotifyModalOpen}
        onClose={() => setIsNotifyModalOpen(false)}
        onSent={handleNotified}
        operatorId="backoffice-operator"
      />
    </div>
  );
}
