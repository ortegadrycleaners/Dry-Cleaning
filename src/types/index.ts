export type OrderStatus = 'RECIBIDO' | 'EN PROCESO' | 'LISTO' | 'ENTREGADO';

export interface Order {
  id: string;
  customerName: string;
  phone: string;
  estimatedDate: string;
  status: OrderStatus;
  rackNumber?: string;
  daysReady?: number;
  createdAt: string;
}

export interface Customer {
  phone: string;
  lastName: string;
}
