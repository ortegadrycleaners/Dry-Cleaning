import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
/* eslint-disable react-refresh/only-export-components */
import type { Order, OrderStatus } from '@/types';
import type { OrderEvent } from '@/types/notifications';
import { eventBus } from '@/services/EventBus';
import { EVENT_NAMES } from '@/services/NotificationService';
import {
  fetchOrdersPage,
  type OrdersViewMode,
  insertOrder,
  updateOrderStatusInDb,
  type InsertOrderResult,
} from '@/services/supabase/ordersService';

interface OrdersContextType {
  orders: Order[];
  isLoading: boolean;
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  viewMode: OrdersViewMode;
  setViewMode: (viewMode: OrdersViewMode) => void;
  autoRefreshAfterStatusChange: boolean;
  setAutoRefreshAfterStatusChange: (value: boolean) => void;
  goToPage: (page: number) => void;
  refreshOrders: (page?: number) => Promise<void>;
  updateOrderStatus: (orderId: string, status: OrderStatus, rackNumber?: string) => Promise<boolean>;
  addOrder: (order: Order) => Promise<InsertOrderResult>;
}

const DEFAULT_PAGE_SIZE = 15;

const OrdersContext = createContext<OrdersContextType | undefined>(undefined);

export function OrdersProvider({ children }: { children: ReactNode }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(DEFAULT_PAGE_SIZE);
  const [totalCount, setTotalCount] = useState(0);
  const [viewMode, setViewModeState] = useState<OrdersViewMode>(() => {
    try {
      const stored = localStorage.getItem('dashboard.orderViewMode');
      if (stored === 'PENDING' || stored === 'READY' || stored === 'DELIVERED' || stored === 'ACTIVE') {
        return stored;
      }
    } catch {
      // ignore
    }
    return 'ACTIVE';
  });
  const [autoRefreshAfterStatusChange, setAutoRefreshAfterStatusChangeState] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem('dashboard.autoRefreshAfterStatusChange');
      return stored === null ? true : stored === '1';
    } catch {
      return true;
    }
  });

  const loadOrdersPage = useCallback(async (targetPage: number, targetViewMode: OrdersViewMode = viewMode) => {
    setIsLoading(true);
    const result = await fetchOrdersPage({ page: targetPage, pageSize, viewMode: targetViewMode });

    if (result.orders.length === 0 && result.totalCount > 0 && targetPage > 1) {
      const maxPage = Math.max(1, Math.ceil(result.totalCount / result.pageSize));
      if (targetPage > maxPage) {
        const fallback = await fetchOrdersPage({ page: maxPage, pageSize: result.pageSize, viewMode: targetViewMode });
        setOrders(fallback.orders);
        setTotalCount(fallback.totalCount);
        setPage(fallback.page);
        setIsLoading(false);
        return;
      }
    }

    setOrders(result.orders);
    setTotalCount(result.totalCount);
    setPage(result.page);
    setIsLoading(false);
  }, [pageSize, viewMode]);

  const refreshOrders = useCallback(
    async (targetPage: number = page) => {
      await loadOrdersPage(targetPage, viewMode);
    },
    [loadOrdersPage, page, viewMode]
  );

  // Carga inicial desde Supabase (async para evitar setState síncrono en el effect)
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await loadOrdersPage(1, viewMode);
      } catch (error) {
        if (!cancelled) {
          console.error('[OrdersContext] Error loading orders:', error);
          setOrders([]);
          setIsLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadOrdersPage, viewMode]);

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  const goToPage = useCallback(
    (nextPage: number) => {
      const safePage = Math.max(1, nextPage);
      void loadOrdersPage(safePage, viewMode);
    },
    [loadOrdersPage, viewMode]
  );

  const setViewMode = useCallback(
    (nextViewMode: OrdersViewMode) => {
      setViewModeState(nextViewMode);
      try {
        localStorage.setItem('dashboard.orderViewMode', nextViewMode);
      } catch {
        // ignore
      }
      void loadOrdersPage(1, nextViewMode);
    },
    [loadOrdersPage]
  );

  const setAutoRefreshAfterStatusChange = useCallback((value: boolean) => {
    setAutoRefreshAfterStatusChangeState(value);
    try {
      localStorage.setItem('dashboard.autoRefreshAfterStatusChange', value ? '1' : '0');
    } catch {
      // ignore
    }
  }, []);

  /**
   * Cambia el estado de una orden en Supabase y actualiza el estado local.
   * NO envía SMS: el envío es una acción explícita del operador.
   */
  const updateOrderStatus = useCallback(
    (orderId: string, status: OrderStatus, rackNumber?: string) => {
      let previousOrder: Order | undefined;

      // Optimistic update
      setOrders((prev) =>
        prev.map((order) => {
          if (order.id !== orderId) return order;
          previousOrder = order;
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

      // Persistir en Supabase; se retorna la promesa para que quien llame
      // pueda esperar la confirmación real antes de acciones dependientes (ej. SMS).
      return updateOrderStatusInDb(orderId, status, rackNumber).then((ok) => {
        if (!ok) {
          console.error('[OrdersContext] No se pudo actualizar el estado en Supabase');
          // Revertir el optimistic update: si no se hace, la UI queda mostrando
          // un estado que nunca se guardó hasta que el usuario refresca la página.
          if (previousOrder) {
            const restored = previousOrder;
            setOrders((prev) =>
              prev.map((order) => (order.id === orderId ? restored : order))
            );
          }
          return false;
        }

        if (status !== 'ENTREGADO' && autoRefreshAfterStatusChange) {
          void loadOrdersPage(page);
        }
        return true;
      });
    },
    [loadOrdersPage, page]
  );

  const addOrder = useCallback(async (order: Order): Promise<InsertOrderResult> => {
    const result = await insertOrder(order);
    if (!result.orderId) {
      console.error('[OrdersContext] No se pudo insertar la orden en Supabase:', result.error);
      return result;
    }

    await loadOrdersPage(1);

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
  }, [loadOrdersPage]);

  const value = useMemo<OrdersContextType>(
    () => ({
      orders,
      isLoading,
      page,
      pageSize,
      totalCount,
      totalPages,
      viewMode,
      setViewMode,
      autoRefreshAfterStatusChange,
      setAutoRefreshAfterStatusChange,
      goToPage,
      refreshOrders,
      updateOrderStatus,
      addOrder,
    }),
    [
      orders,
      isLoading,
      page,
      pageSize,
      totalCount,
      totalPages,
      viewMode,
      setViewMode,
      autoRefreshAfterStatusChange,
      setAutoRefreshAfterStatusChange,
      goToPage,
      refreshOrders,
      updateOrderStatus,
      addOrder,
    ]
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
