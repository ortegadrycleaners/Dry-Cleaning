import { createContext, useContext, useState, type ReactNode } from 'react';
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

  const updateOrderStatus = (orderId: string, status: OrderStatus, rackNumber?: string) => {
    setOrders(prevOrders =>
      prevOrders.map(order => {
        if (order.id === orderId) {
          const updatedOrder = { ...order, status };
          if (rackNumber) {
            updatedOrder.rackNumber = rackNumber;
          }
          if (status === 'LISTO') {
            updatedOrder.daysReady = 0;
          }
          return updatedOrder;
        }
        return order;
      })
    );
  };

  const addOrder = (order: Order) => {
    setOrders(prevOrders => [order, ...prevOrders]);
  };

  return (
    <OrdersContext.Provider value={{ orders, updateOrderStatus, addOrder }}>
      {children}
    </OrdersContext.Provider>
  );
}

export function useOrders() {
  const context = useContext(OrdersContext);
  if (context === undefined) {
    throw new Error('useOrders must be used within an OrdersProvider');
  }
  return context;
}
