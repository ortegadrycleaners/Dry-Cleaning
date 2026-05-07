import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { Order, OrderStatus } from '@/types';
import type { OrderEvent } from '@/types/notifications';
import { mockOrders } from '@/data/mockData';
import { eventBus } from '@/services/EventBus';
import { EVENT_NAMES } from '@/services/NotificationService';

interface OrdersContextType {
  orders: Order[];
  updateOrderStatus: (orderId: string, status: OrderStatus, rackNumber?: string) => void;
  addOrder: (order: Order) => void;
}

const OrdersContext = createContext<OrdersContextType | undefined>(undefined);

export function OrdersProvider({ children }: { children: ReactNode }) {
  const [orders, setOrders] = useState<Order[]>(mockOrders);

  /**
   * Cambia el estado de una orden. NO envía SMS: el envío a Twilio es una
   * acción explícita del operador a través del único botón "Notificar al
   * cliente" (ver TwilioService.notifyOrderReady).
   */
  const updateOrderStatus = useCallback(
    (orderId: string, status: OrderStatus, rackNumber?: string) => {
      setOrders(prevOrders => {
        return prevOrders.map(order => {
          if (order.id !== orderId) return order;

          const updatedOrder = { ...order, status };
          if (rackNumber) {
            updatedOrder.rackNumber = rackNumber;
          }
          if (status === 'LISTO') {
            updatedOrder.daysReady = 0;
          }
          return updatedOrder;
        });
      });
    },
    []
  );

  const addOrder = useCallback((order: Order) => {
    setOrders(prevOrders => [order, ...prevOrders]);

    const event: OrderEvent = {
      type: 'ORDER_CREATED',
      orderId: order.id,
      orderNumber: order.orderNumber,
      customerName: order.customerName,
      phone: order.phone,
      timestamp: new Date().toISOString(),
      payload: { estimatedDate: order.estimatedDate },
    };
    queueMicrotask(() => eventBus.emit(EVENT_NAMES.ORDER_CREATED, event));
  }, []);

  const value = useMemo<OrdersContextType>(() => ({ orders, updateOrderStatus, addOrder }), [
    orders,
    updateOrderStatus,
    addOrder,
  ]);

  return (
    <OrdersContext.Provider value={value}>{children}</OrdersContext.Provider>
  );
}

export function useOrders() {
  const context = useContext(OrdersContext);
  if (context === undefined) {
    throw new Error('useOrders must be used within an OrdersProvider');
  }
  return context;
}
