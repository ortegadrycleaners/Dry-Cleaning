export type OrderStatus = 'RECIBIDO' | 'EN PROCESO' | 'LISTO' | 'ENTREGADO';

/** id: identificador opaco (p. ej. hash Base62 en URL); orderNumber: ticket visible en backoffice. */
export interface Order {
  id: string;
  orderNumber: string;
  customerName: string;
  phone: string;
  estimatedDate: string;
  status: OrderStatus;
  rackNumber?: string;
  daysReady?: number;
  createdAt: string;
  notes?: string;
}

export interface Customer {
  phone: string;
  lastName: string;
}
