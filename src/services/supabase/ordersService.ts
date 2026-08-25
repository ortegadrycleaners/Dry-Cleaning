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

export type OrdersViewMode = 'ACTIVE' | 'PENDING' | 'READY' | 'DELIVERED';
export type SortField = 'date' | 'orderNumber';
export type SortDirection = 'asc' | 'desc';

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
  sortBy?: SortField;
  sortOrder?: SortDirection;
}

export interface InsertOrderResult {
  orderId: string | null;
  publicId: string | null;
  error?: string;
  errorParams?: Record<string, string>;
  code?:
    | 'ORDER_NUMBER_EXISTS'
    | 'PHONE_NAME_MISMATCH'
    | 'CLIENT_INSERT_FAILED'
    | 'RECEIPT_INSERT_FAILED'
    | 'DATABASE_ERROR'
    | 'PHONE_INVALID'
    | 'ORDER_NUMBER_INVALID';
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

function normalizeCustomerName(value: string): string {
  return String(value).trim().toLowerCase();
}

async function resolveClientId(
  phoneNumber: number,
  customerName: string
): Promise<{ clientId: string | null; error?: InsertOrderResult }> {
  const { data: existingCustomer, error: existingError } = await supabase
    .from('client')
    .select('id_client, name')
    .eq('phone_number', phoneNumber)
    .maybeSingle();

  if (existingError) {
    console.error('[ordersService] resolveClientId (lookup) error:', existingError.message);
    return {
      clientId: null,
      error: {
        orderId: null,
        publicId: null,
        error: 'No se pudo verificar el cliente existente.',
        code: 'DATABASE_ERROR',
      },
    };
  }

  if (existingCustomer) {
    if (normalizeCustomerName(existingCustomer.name ?? '') !== normalizeCustomerName(customerName)) {
      return {
        clientId: null,
        error: {
          orderId: null,
          publicId: null,
          error: `El número ${formatPhone(phoneNumber)} ya está registrado con otro nombre.`,
          errorParams: { phone: formatPhone(phoneNumber), customerName: existingCustomer.name ?? '' },
          code: 'PHONE_NAME_MISMATCH',
        },
      };
    }

    return { clientId: existingCustomer.id_client };
  }

  const clientId = crypto.randomUUID();
  const { error: insertError } = await supabase.from('client').insert({
    id_client: clientId,
    phone_number: phoneNumber,
    name: customerName,
  });

  if (insertError) {
    if (isUniqueViolation(insertError)) {
      const { data: conflictedCustomer, error: conflictError } = await supabase
        .from('client')
        .select('id_client, name')
        .eq('phone_number', phoneNumber)
        .maybeSingle();

      if (conflictError) {
        console.error('[ordersService] resolveClientId (conflict lookup) error:', conflictError.message);
        return {
          clientId: null,
          error: {
            orderId: null,
            publicId: null,
            error: 'No se pudo registrar el cliente.',
            code: 'CLIENT_INSERT_FAILED',
          },
        };
      }

      if (conflictedCustomer) {
        if (normalizeCustomerName(conflictedCustomer.name ?? '') !== normalizeCustomerName(customerName)) {
          return {
            clientId: null,
            error: {
              orderId: null,
              publicId: null,
              error: `El número ${formatPhone(phoneNumber)} ya está registrado con otro nombre.`,
              errorParams: { phone: formatPhone(phoneNumber), customerName: conflictedCustomer.name ?? '' },
              code: 'PHONE_NAME_MISMATCH',
            },
          };
        }

        return { clientId: conflictedCustomer.id_client };
      }
    }

    console.error('[ordersService] resolveClientId (insert) error:', insertError.message);
    return {
      clientId: null,
      error: {
        orderId: null,
        publicId: null,
        error: 'No se pudo registrar el cliente.',
        code: 'CLIENT_INSERT_FAILED',
      },
    };
  }

  return { clientId };
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
  sortBy = 'date',
  sortOrder = 'desc',
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

  const orderColumn = sortBy === 'orderNumber' ? 'order_number' : 'order_date';
  const isAscending = sortOrder === 'asc';

  const { data, error, count } = await query.order(orderColumn, { ascending: isAscending }).range(from, to);

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

export async function insertOrder(order: Order): Promise<InsertOrderResult> {
  const rawPhoneDigits = normalizePhoneDigits(order.phone);
  if (!rawPhoneDigits) {
    return {
      orderId: null,
      publicId: null,
      error: 'El teléfono no es válido.',
      code: 'PHONE_INVALID',
    };
  }

  const numericOrderNumber = parseInt(order.orderNumber.trim(), 10);
  if (Number.isNaN(numericOrderNumber) || numericOrderNumber <= 0) {
    return {
      orderId: null,
      publicId: null,
      error: 'El número de orden debe ser un número válido.',
      code: 'ORDER_NUMBER_INVALID',
    };
  }

  const orderId = order.id && isUuid(order.id) ? order.id : crypto.randomUUID();
  const publicId = order.publicId?.trim() || generatePublicId(12);
  const normalizedCustomerName = order.customerName.trim();
  const phoneNumber = parseInt(rawPhoneDigits, 10);

  const resolvedClient = await resolveClientId(phoneNumber, normalizedCustomerName);
  if (resolvedClient.error) {
    return resolvedClient.error;
  }

  const deliverDate = (() => {
    const parsed = new Date(order.estimatedDate);
    return isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
  })();

  const { data: insertedOrder, error: receiptError } = await supabase
    .from('receipt')
    .insert({
      id_order: orderId,
      public_id: publicId,
      order_number: numericOrderNumber,
      order_date: new Date().toISOString(),
      deliver_date: deliverDate,
      fk_cliente: resolvedClient.clientId,
      status: order.status,
      status_updated_at: new Date().toISOString(),
      notes: order.notes ?? null,
    })
    .select('id_order, public_id')
    .single();

  if (receiptError || !insertedOrder) {
    if (isUniqueViolation(receiptError)) {
      return {
        orderId: null,
        publicId: null,
        error: `El número de orden ${numericOrderNumber} ya existe.`,
        errorParams: { orderNumber: String(numericOrderNumber) },
        code: 'ORDER_NUMBER_EXISTS',
      };
    }

    console.error('[ordersService] insertOrder (receipt insert) error:', receiptError);
    return {
      orderId: null,
      publicId: null,
      error: receiptError?.message ?? 'No se pudo crear la orden. Verifica que el número de orden no exista.',
      code: 'RECEIPT_INSERT_FAILED',
    };
  }

  return {
    orderId: insertedOrder.id_order,
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
  // Soporta links legacy basados en UUID.
  if (isUuid(publicId)) {
    return fetchOrderById(publicId);
  }

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

export interface DailyReportOrder {
  orderNumber: string;
  phone: string;
  orderDate: string;
  formattedTime: string;
}

export interface FetchDailyReportResult {
  orders: DailyReportOrder[];
  error: string | null;
}

function formatTimeOnly(isoString: string): string {
  if (!isoString) return '';
  const date = new Date(isoString);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
}

/**
 * Consulta optimizada para obtener las órdenes creadas en la fecha actual (día local)
 * trayendo únicamente el payload mínimo (order_number, order_date, cliente phone).
 */
export async function fetchTodayDailyReport(): Promise<FetchDailyReportResult> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);

  const { data, error } = await supabase
    .from('receipt')
    .select(`
      order_number,
      order_date,
      client:fk_cliente (
        phone_number
      )
    `)
    .gte('order_date', startOfDay.toISOString())
    .lte('order_date', endOfDay.toISOString())
    .order('order_date', { ascending: true });

  if (error) {
    console.error('[ordersService] fetchTodayDailyReport error:', error.message);
    return { orders: [], error: 'No se pudieron consultar las órdenes del día.' };
  }

  const orders: DailyReportOrder[] = (data || []).map((row: any) => {
    const clientData = extractClientData(row.client);
    const rawPhone = clientData?.phone_number ?? '';
    return {
      orderNumber: String(row.order_number ?? ''),
      phone: rawPhone ? formatPhone(rawPhone) : 'N/A',
      orderDate: row.order_date ?? '',
      formattedTime: row.order_date ? formatTimeOnly(row.order_date) : '',
    };
  });

  return { orders, error: null };
}

/**
 * Elimina físicamente una orden de Supabase por su id_order (UUID).
 * Las notificaciones y tareas asociadas se eliminan en cascada automáticamente (ON DELETE CASCADE).
 * La información del cliente asociado permanece intacta.
 */
export async function deleteOrderFromDb(orderId: string): Promise<{ success: boolean; error?: string }> {
  console.log(`[ordersService] Audit Log: Intentando eliminar físicamente la orden con ID: ${orderId}`);
  
  const { data, error } = await supabase
    .from('receipt')
    .delete()
    .eq('id_order', orderId)
    .select('id_order');

  if (error) {
    console.error('[ordersService] Error al eliminar orden de Supabase:', error.message);
    return { success: false, error: error.message };
  }

  if (!data || data.length === 0) {
    const errorMsg = 'No se pudo eliminar la orden en Supabase. Posible falta de permisos RLS o la orden no existe.';
    console.error(`[ordersService] ${errorMsg} (ID: ${orderId})`);
    return { success: false, error: errorMsg };
  }

  console.log(`[ordersService] Audit Log: Orden ${orderId} eliminada exitosamente de Supabase (${data.length} fila/s eliminada/s).`);
  return { success: true };
}


