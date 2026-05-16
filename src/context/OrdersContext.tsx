import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Order, OrderStatus } from '@/types';
import type { OrderEvent } from '@/types/notifications';
import { eventBus } from '@/services/EventBus';
import { EVENT_NAMES } from '@/services/NotificationService';
import {
  fetchOrders,
  insertOrder,
  updateOrderStatusInDb,
  type InsertOrderResult,
} from '@/services/supabase/ordersService';

interface OrdersContextType {
  orders: Order[];
  isLoading: boolean;
  updateOrderStatus: (orderId: string, status: OrderStatus, rackNumber?: string) => void;
  addOrder: (order: Order) => Promise<InsertOrderResult>;
}

const OrdersContext = createContext<OrdersContextType | undefined>(undefined);

export function OrdersProvider({ children }: { children: ReactNode }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Carga inicial desde Supabase
  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    fetchOrders()
      .then((data) => {
        if (!cancelled) {
          setOrders(data);
          setIsLoading(false);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          console.error('[OrdersContext] Error loading orders:', error);
          setOrders([]);
          setIsLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Cambia el estado de una orden en Supabase y actualiza el estado local.
   * NO envía SMS: el envío es una acción explícita del operador.
   */
  const updateOrderStatus = useCallback(
    (orderId: string, status: OrderStatus, rackNumber?: string) => {
      // Optimistic update
      setOrders((prev) =>
        prev.map((order) => {
          if (order.id !== orderId) return order;
          const updated = { ...order, status, statusUpdatedAt: new Date().toISOString() };
          if (rackNumber !== undefined) {
            updated.rackNumber = rackNumber;
          } else if (status === 'RECIBIDO') {
            // Limpiar rackNumber al revertir a recibido
            updated.rackNumber = undefined;
          }
          if (status === 'LISTO') {
            updated.daysReady = 0;
          } else if (status === 'RECIBIDO') {
            // Limpiar daysReady al revertir
            updated.daysReady = undefined;
          }
          return updated;
        })
      );

      // Persistir en Supabase (en background, sin bloquear UI)
      updateOrderStatusInDb(orderId, status, rackNumber).then((ok) => {
        if (!ok) {
          console.error('[OrdersContext] No se pudo actualizar el estado en Supabase');
        }
      });
    },
    []
  );

  const addOrder = useCallback(async (order: Order): Promise<InsertOrderResult> => {
    setOrders((prev) => [order, ...prev]);

    const result = await insertOrder(order);
    if (!result.orderId) {
      console.error('[OrdersContext] No se pudo insertar la orden en Supabase:', result.error);
      setOrders((prev) => prev.filter((o) => o.id !== order.id));
      return result;
    }

    setOrders((prev) =>
      prev.map((o) => {
        if (o.id !== order.id) return o;
        return {
          ...o,
          id: result.orderId as string,
          publicId: result.publicId ?? o.publicId,
        };
      })
    );

    const event: OrderEvent = {
      type: 'ORDER_CREATED',
      orderId: result.orderId,
      orderNumber: order.orderNumber,
      customerName: order.customerName,
      phone: order.phone,
      timestamp: new Date().toISOString(),
      payload: { estimatedDate: order.estimatedDate },
    };
    queueMicrotask(() => eventBus.emit(EVENT_NAMES.ORDER_CREATED, event));

    return result;
  }, []);

  const value = useMemo<OrdersContextType>(
    () => ({ orders, isLoading, updateOrderStatus, addOrder }),
    [orders, isLoading, updateOrderStatus, addOrder]
  );

  return <OrdersContext.Provider value={value}>{children}</OrdersContext.Provider>;
}

export function useOrders() {
  const context = useContext(OrdersContext);
  if (context === undefined) {
    throw new Error('useOrders must be used within an OrdersProvider');
  }
  return context;
}
