import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
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
import { Sparkles, Plus, LogOut, Search, Package, AlertTriangle, CheckCircle2, Clock } from 'lucide-react';
import { NotificationsPanel } from '@/components/NotificationsPanel';

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
    onConfirm(rackNumber);
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
              Orden <span className="font-semibold text-[#1B2A4A]">#{orderTicketLabel(order)}</span>
            </p>
            <p className="text-sm text-gray-600">
              Cliente: <span className="font-medium">{order.customerName}</span>
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="rackNumber" className="text-sm font-medium text-gray-700">
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
            Confirmar y Enviar SMS
          </Button>
          <p className="text-xs text-center text-gray-500">
            Se enviará un SMS automático al cliente
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

export function DashboardPage() {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const { orders, updateOrderStatus } = useOrders();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const filteredOrders = useMemo(() => {
    if (!searchQuery.trim()) return orders;
    const query = searchQuery.toLowerCase();
    return orders.filter(order => {
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
    setIsModalOpen(true);
  };

  const handleConfirmReady = (rackNumber: string) => {
    if (selectedOrder) {
      updateOrderStatus(selectedOrder.id, 'LISTO', rackNumber);
    }
    setIsModalOpen(false);
    setSelectedOrder(null);
  };

  const handleMarkDelivered = (orderId: string) => {
    updateOrderStatus(orderId, 'ENTREGADO');
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
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

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Search Bar */}
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

        {/* Orders Table */}
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
                  {filteredOrders.map((order) => (
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
                        {(order.status === 'RECIBIDO' || order.status === 'EN PROCESO') && (
                          <Button
                            size="sm"
                            onClick={() => handleMarkReady(order)}
                            className="bg-[#1B2A4A] hover:bg-[#2a3d66] text-white text-xs"
                          >
                            Marcar Listo
                          </Button>
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
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </main>

      {/* Mark Ready Modal */}
      <MarkReadyModal
        order={selectedOrder}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onConfirm={handleConfirmReady}
      />
    </div>
  );
}
