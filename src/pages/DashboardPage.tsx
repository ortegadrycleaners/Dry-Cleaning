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
  Sparkles,
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
              className="h-11 border-gray-200 focus:border-[#C9A84C] focus:ring-[#C9A84C]"
            />
            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>
          <Button
            onClick={handleConfirm}
            className="w-full h-11 bg-[#C9A84C] hover:bg-[#b89943] text-[#1B2A4A] font-semibold"
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
            className="w-full h-11 bg-[#1B2A4A] hover:bg-[#2a3d66] text-white font-semibold disabled:opacity-50"
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
      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-500 border border-gray-200">
        <CheckCircle2 className="w-3 h-3 mr-1" />
        ENTREGADO
      </span>
    );
  }

  if (status === 'LISTO' && daysReady && daysReady >= 2) {
    return (
      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
        <AlertTriangle className="w-3 h-3 mr-1" />
        LISTO ⚠️ {daysReady} {daysReady === 1 ? 'día' : 'días'}
      </span>
    );
  }

  if (status === 'LISTO') {
    return (
      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-200">
        <CheckCircle2 className="w-3 h-3 mr-1" />
        LISTO
      </span>
    );
  }

  if (status === 'EN PROCESO') {
    return (
      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
        <Clock className="w-3 h-3 mr-1" />
        EN PROCESO
      </span>
    );
  }

  return (
    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700 border border-gray-200">
      <Package className="w-3 h-3 mr-1" />
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
  const notifiedOrderIds = useNotifiedOrderIds(historyTick);

  const filteredOrders = useMemo(() => {
    if (!searchQuery.trim()) return orders;
    const query = searchQuery.toLowerCase();
    return orders.filter((order) => {
      const ticket = orderTicketLabel(order);
      return (
        order.phone.toLowerCase().includes(query) ||
        order.id.toLowerCase().includes(query) ||
        ticket.toLowerCase().includes(query)
      );
    });
  }, [orders, searchQuery]);

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
    updateOrderStatus(orderId, 'ENTREGADO');
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-[#1B2A4A] rounded-full flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-[#C9A84C]" />
              </div>
              <span className="text-lg font-bold text-[#1B2A4A] hidden sm:block">
                Tintorería Elegance
              </span>
            </div>
            <div className="flex items-center gap-3">
              <Button
                onClick={() => navigate('/dashboard/nueva')}
                className="bg-[#C9A84C] hover:bg-[#b89943] text-[#1B2A4A] font-medium"
              >
                <Plus className="w-4 h-4 mr-2" />
                Nueva Orden
              </Button>
              <NotificationsPanel />
              <button
                onClick={handleLogout}
                className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1 px-3 py-2"
              >
                <LogOut className="w-4 h-4" />
                <span className="hidden sm:inline">Salir</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="mb-6">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              type="text"
              placeholder="Buscar por teléfono o nº de orden"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 h-11 border-gray-200 focus:border-[#C9A84C] focus:ring-[#C9A84C]"
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
              <Button
                onClick={() => navigate('/dashboard/nueva')}
                className="bg-[#C9A84C] hover:bg-[#b89943] text-[#1B2A4A] font-medium"
              >
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
                      <TableRow key={order.id} className="hover:bg-slate-50">
                        <TableCell className="font-medium text-[#1B2A4A]">
                          #{orderTicketLabel(order)}
                        </TableCell>
                        <TableCell>{order.customerName}</TableCell>
                        <TableCell className="text-gray-600">{order.phone}</TableCell>
                        <TableCell className="text-gray-600">{order.estimatedDate}</TableCell>
                        <TableCell>
                          <StatusBadge order={order} />
                          {order.rackNumber && order.status !== 'ENTREGADO' && (
                            <span className="ml-2 text-xs text-gray-500">
                              Rack #{order.rackNumber}
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap items-center gap-2">
                            {(order.status === 'RECIBIDO' || order.status === 'EN PROCESO') && (
                              <Button
                                size="sm"
                                onClick={() => handleMarkReady(order)}
                                className="bg-[#1B2A4A] hover:bg-[#2a3d66] text-white text-xs"
                              >
                                Marcar Listo
                              </Button>
                            )}

                            {order.status === 'LISTO' && !alreadyNotified && (
                              <Button
                                size="sm"
                                onClick={() => handleOpenNotify(order)}
                                className="bg-[#C9A84C] hover:bg-[#b89943] text-[#1B2A4A] text-xs font-semibold"
                              >
                                <Send className="w-3.5 h-3.5 mr-1" />
                                Notificar al cliente
                              </Button>
                            )}

                            {order.status === 'LISTO' && alreadyNotified && (
                              <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-green-50 text-green-700 border border-green-200">
                                <ShieldCheck className="w-3.5 h-3.5 mr-1" />
                                Notificado
                              </span>
                            )}

                            {order.status === 'LISTO' && (
                              <Button
                                size="sm"
                                onClick={() => handleMarkDelivered(order.id)}
                                className="bg-green-600 hover:bg-green-700 text-white text-xs"
                              >
                                Entregado
                              </Button>
                            )}

                            {order.status === 'ENTREGADO' && (
                              <span className="text-gray-400 text-sm">—</span>
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
