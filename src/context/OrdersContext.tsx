import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { Order, OrderStatus } from '@/types';
import { mockOrders } from '@/data/mockData';

interface OrdersContextType {
  orders: Order[];
  updateOrderStatus: (orderId: string, status: OrderStatus, rackNumber?: string) => void;
  addOrder: (order: Order) => void;
}

const OrdersContext = createContext<OrdersContextType | undefined>(undefined);

export function OrdersProvider({ children }: { children: ReactNode }) {
  const [orders, setOrders] = useState<Order[]>(mockOrders);

  const updateOrderStatus = useCallback(
    (orderId: string, status: OrderStatus, rackNumber?: string) => {
      setOrders(prevOrders =>
        prevOrders.map(order => {
          if (order.id !== orderId) return order;

          const updatedOrder = { ...order, status };
          if (rackNumber) {
            updatedOrder.rackNumber = rackNumber;
          }
          if (status === 'LISTO') {
            updatedOrder.daysReady = 0;
          }
          return updatedOrder;
        })
      );
    },
    []
  );

  const addOrder = useCallback((order: Order) => {
    setOrders(prevOrders => [order, ...prevOrders]);
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
