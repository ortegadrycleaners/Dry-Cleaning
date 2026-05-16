export type OrderStatus = 'RECIBIDO' | 'EN PROCESO' | 'LISTO' | 'ENTREGADO';

/** id: UUID interno; publicId: identificador opaco Base62 para tracking público. */
export interface Order {
  id: string;
  publicId?: string;
  orderNumber: string;
  customerName: string;
  phone: string;
  estimatedDate: string;
  status: OrderStatus;
  rackNumber?: string;
  daysReady?: number;
  createdAt: string;
  statusUpdatedAt?: string;
  notes?: string;
}

export interface Customer {
  phone: string;
  lastName: string;
}
