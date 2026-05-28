/**
 * ordersService.ts — Capa de acceso a datos para órdenes en Supabase.
 *
 * Esquema de la BD:
 *   Table "client"  → id_client (uuid PK), phone_number (numeric), name (varchar)
 *   Table "receipt" → id_order (uuid), order_number (numeric), order_date (timestamp),
 *                     deliver_date (timestamp), fk_cliente (uuid FK), status (text),
 *                     rack_number (text?), days_ready (int?), notes (text?)
 *                     PK: (fk_cliente, id_order)
 */

import { supabase } from '@/lib/supabase';
import { generatePublicId } from '@/lib/utils';
import { formatDate } from '@/i18n';
import type { Order, OrderStatus } from '@/types';

const ORDER_SELECT = `
  id_order,
  public_id,
  order_number,
  order_date,
  deliver_date,
  status,
  status_updated_at,
  rack_number,
  days_ready,
  notes,
  client:fk_cliente (
    name,
    phone_number
  )
`;

type OrderClientRow = {
  name: string;
  phone_number: number;
};

type OrderQueryRow = {
  id_order: string;
  public_id?: string | null;
  order_number: number | string;
  order_date: string;
  deliver_date: string;
  status: OrderStatus;
  status_updated_at?: string | null;
  rack_number?: string | null;
  days_ready?: number | null;
  notes?: string | null;
  client?: OrderClientRow | OrderClientRow[] | null;
};

type CreateOrderAtomicRow = {
  order_id: string;
  public_id: string;
};

export type OrdersViewMode = 'ACTIVE' | 'PENDING' | 'READY' | 'DELIVERED';

export interface OrdersPageResult {
  orders: Order[];
  totalCount: number;
  page: number;
  pageSize: number;
}

export interface FetchOrdersPageOptions {
  page?: number;
  pageSize?: number;
  viewMode?: OrdersViewMode;
}

export interface InsertOrderResult {
  orderId: string | null;
  publicId: string | null;
  error?: string;
  code?:
    | 'ORDER_NUMBER_EXISTS'
    | 'PHONE_NAME_MISMATCH'
    | 'CLIENT_INSERT_FAILED'
    | 'RECEIPT_INSERT_FAILED'
    | 'DATABASE_ERROR';
}

function normalizePhoneDigits(raw: string): string {
  return String(raw).replace(/\D/g, '');
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

function isUniqueViolation(error: { code?: string; message?: string } | null | undefined): boolean {
  return error?.code === '23505' || Boolean(error?.message?.toLowerCase().includes('unique'));
}

/** Convierte un numeric de teléfono (ej. 7875550101) al formato (787) 555-0101 */
function formatPhone(raw: number | string): string {
  const digits = String(raw).replace(/\D/g, '');
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return digits;
}

/** Convierte un timestamp ISO al formato localizado según el navegador */
function formatDisplayDate(iso: string): string {
  if (!iso) return '';
  return formatDate(iso);
}

function extractClientData(client: OrderQueryRow['client']): OrderClientRow | null {
  if (!client) return null;
  if (Array.isArray(client)) {
    return client[0] ?? null;
  }
  return client;
}

/** Convierte un timestamp ISO a "YYYY-MM-DD" para el campo createdAt */
function toDateString(iso: string): string {
  if (!iso) return '';
  return iso.split('T')[0];
}

/** Mapea una fila de Supabase (join receipt + client) al tipo Order de la app */
function rowToOrder(row: OrderQueryRow): Order {
  const clientData = extractClientData(row.client);
  return {
    id: row.id_order,
    publicId: row.public_id ?? undefined,
    orderNumber: String(row.order_number),
    customerName: clientData?.name ?? '',
    phone: formatPhone(clientData?.phone_number ?? 0),
    estimatedDate: formatDisplayDate(row.deliver_date),
    status: row.status ?? 'RECIBIDO',
    rackNumber: row.rack_number ?? undefined,
    daysReady: row.days_ready ?? undefined,
    createdAt: toDateString(row.order_date),
    statusUpdatedAt: row.status_updated_at ?? undefined,
    notes: row.notes ?? undefined,
  };
}

export async function fetchOrdersPage({
  page = 1,
  pageSize = 15,
  viewMode = 'ACTIVE',
}: FetchOrdersPageOptions = {}): Promise<OrdersPageResult> {
  const safePage = Number.isFinite(page) ? Math.max(1, Math.floor(page)) : 1;
  const safePageSize = Number.isFinite(pageSize) ? Math.max(1, Math.floor(pageSize)) : 15;
  const from = (safePage - 1) * safePageSize;
  const to = from + safePageSize - 1;

  const query = supabase.from('receipt').select(ORDER_SELECT, { count: 'exact' });

  switch (viewMode) {
    case 'PENDING':
      query.in('status', ['RECIBIDO', 'EN PROCESO']);
      break;
    case 'READY':
      query.eq('status', 'LISTO');
      break;
    case 'DELIVERED':
      query.eq('status', 'ENTREGADO');
      break;
    default:
      query.neq('status', 'ENTREGADO').neq('status', 'ABANDONADO');
      break;
  }

  const { data, error, count } = await query.order('order_date', { ascending: false }).range(from, to);

  if (error) {
    console.error('[ordersService] fetchOrdersPage error:', error.message);
    return {
      orders: [],
      totalCount: 0,
      page: safePage,
      pageSize: safePageSize,
    };
  }

  return {
    orders: (data ?? []).map((row) => rowToOrder(row as OrderQueryRow)),
    totalCount: count ?? 0,
    page: safePage,
    pageSize: safePageSize,
  };
}

export async function fetchOrderNumberExists(orderNumber: string | number): Promise<boolean> {
  const numericOrderNumber = parseInt(String(orderNumber).trim(), 10);
  if (Number.isNaN(numericOrderNumber)) {
    return false;
  }

  const { data, error } = await supabase
    .from('receipt')
    .select('id_order')
    .eq('order_number', numericOrderNumber)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('[ordersService] fetchOrderNumberExists error:', error.message);
    return false;
  }

  return data !== null;
}

export async function fetchRackConflict(orderId: string, rackNumber: string): Promise<Order | null> {
  const normalizedRack = rackNumber.trim();
  if (!normalizedRack) return null;

  const { data, error } = await supabase
    .from('receipt')
    .select(ORDER_SELECT)
    .eq('rack_number', normalizedRack)
    .neq('id_order', orderId)
    .neq('status', 'ENTREGADO')
    .neq('status', 'ABANDONADO')
    .order('order_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('[ordersService] fetchRackConflict error:', error.message);
    return null;
  }

  return data ? rowToOrder(data as OrderQueryRow) : null;
}

export async function fetchReadyOrdersForReminders(): Promise<Order[]> {
  const { data, error } = await supabase
    .from('receipt')
    .select(ORDER_SELECT)
    .eq('status', 'LISTO')
    .order('status_updated_at', { ascending: false });

  if (error) {
    console.error('[ordersService] fetchReadyOrdersForReminders error:', error.message);
    return [];
  }

  return (data ?? []).map((row) => rowToOrder(row as OrderQueryRow));
}

/** Carga todas las órdenes uniendo receipt + client, ordenadas por fecha desc */
export async function fetchOrders(): Promise<Order[]> {
  const { data, error } = await supabase
    .from('receipt')
    .select(`
      id_order,
      order_number,
      order_date,
      deliver_date,
      status,
      status_updated_at,
      rack_number,
      days_ready,
      notes,
      public_id,
      client:fk_cliente (
        name,
        phone_number
      )
    `)
    .order('order_date', { ascending: false });

  if (error) {
    console.error('[ordersService] fetchOrders error:', error.message);
    return [];
  }

  return (data ?? []).map((row) => rowToOrder(row as OrderQueryRow));
}

/**
 * Inserta un nuevo cliente (si no existe por phone) y una nueva orden en Supabase.
 * Retorna el id_order (UUID) asignado, o null si ocurrió un error.
 */
export async function insertOrder(order: Order): Promise<InsertOrderResult> {
  const rawPhoneDigits = normalizePhoneDigits(order.phone);
  if (!rawPhoneDigits) {
    return {
      orderId: null,
      publicId: null,
      error: 'El teléfono no es válido.',
      code: 'DATABASE_ERROR',
    };
  }

  const rawPhone = rawPhoneDigits;
  const numericOrderNumber = parseInt(order.orderNumber.trim(), 10);
  if (Number.isNaN(numericOrderNumber) || numericOrderNumber <= 0) {
    return {
      orderId: null,
      publicId: null,
      error: 'El número de orden debe ser un número válido.',
      code: 'DATABASE_ERROR',
    };
  }

  const orderId = order.id && isUuid(order.id) ? order.id : crypto.randomUUID();
  const publicId = order.publicId?.trim() || generatePublicId(12);

  const deliverDate = (() => {
    const parsed = new Date(order.estimatedDate);
    return isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
  })();

  const { data: insertedOrder, error: receiptError } = await supabase
    .rpc('create_order_atomic', {
      p_order_id: orderId,
      p_public_id: publicId,
      p_order_number: numericOrderNumber,
      p_phone: rawPhone,
      p_customer_name: order.customerName,
      p_deliver_date: deliverDate,
      p_status: order.status,
      p_notes: order.notes ?? null,
    })
    .returns<CreateOrderAtomicRow[]>()
    .single();

  if (receiptError || !insertedOrder) {
    if (isUniqueViolation(receiptError)) {
      return {
        orderId: null,
        publicId: null,
        error: `El número de orden ${numericOrderNumber} ya existe.`,
        code: 'ORDER_NUMBER_EXISTS',
      };
    }

    if (receiptError?.code === '22000') {
      return {
        orderId: null,
        publicId: null,
        error: receiptError.message,
        code: 'PHONE_NAME_MISMATCH',
      };
    }

    console.error('[ordersService] insertOrder (receipt rpc) error:', receiptError);
    return {
      orderId: null,
      publicId: null,
      error: receiptError?.message ?? 'No se pudo crear la orden. Verifica que el número de orden no exista.',
      code: 'RECEIPT_INSERT_FAILED',
    };
  }

  return {
    orderId: insertedOrder.order_id,
    publicId: insertedOrder.public_id,
  };
}

/** Actualiza el estado de una orden y opcionalmente el número de rack */
export async function updateOrderStatusInDb(
  orderId: string,
  status: OrderStatus,
  rackNumber?: string
): Promise<boolean> {
  const updates: Record<string, unknown> = {
    status,
    status_updated_at: new Date().toISOString(),
  };
  if (rackNumber !== undefined) {
    updates.rack_number = rackNumber;
  } else if (status === 'RECIBIDO') {
    // Limpiar rack_number al revertir a recibido
    updates.rack_number = null;
  }
  if (status === 'LISTO') {
    updates.days_ready = 0;
  } else if (status === 'RECIBIDO') {
    // Limpiar days_ready al revertir
    updates.days_ready = null;
  }

  const { error } = await supabase
    .from('receipt')
    .update(updates)
    .eq('id_order', orderId);

  if (error) {
    console.error('[ordersService] updateOrderStatus error:', error.message);
    return false;
  }
  return true;
}

/** Busca una orden por su id_order para la página de tracking */
export async function fetchOrderById(orderId: string): Promise<Order | null> {
  const { data, error } = await supabase
    .from('receipt')
    .select(`
      id_order,
      public_id,
      order_number,
      order_date,
      deliver_date,
      status,
      status_updated_at,
      rack_number,
      days_ready,
      notes,
      client:fk_cliente (
        name,
        phone_number
      )
    `)
    .eq('id_order', orderId)
    .maybeSingle();

  if (error || !data) {
    console.error('[ordersService] fetchOrderById error:', error?.message);
    return null;
  }

  return rowToOrder(data as OrderQueryRow);
}

/** Busca una orden por su public_id para la página de tracking pública.
 *  RLS automáticamente valida que (public_id = ? AND auth.role() = 'anon')
 *  Solo retorna la orden si el visitante la puede ver.
 */
export async function fetchOrderByPublicId(publicId: string): Promise<Order | null> {
  const { data, error } = await supabase
    .from('receipt')
    .select(`
      id_order,
      public_id,
      order_number,
      order_date,
      deliver_date,
      status,
      status_updated_at,
      rack_number,
      days_ready,
      notes,
      client:fk_cliente (
        name,
        phone_number
      )
    `)
    .eq('public_id', publicId)
    .maybeSingle();

  if (error) {
    console.error('[ordersService] fetchOrderByPublicId error:', error?.message);
    return null;
  }

  if (!data && isUuid(publicId)) {
    return fetchOrderById(publicId);
  }

  if (!data) {
    return null;
  }

  return rowToOrder(data as OrderQueryRow);
}
