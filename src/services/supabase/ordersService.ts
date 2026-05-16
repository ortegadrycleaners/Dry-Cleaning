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
import type { Order, OrderStatus } from '@/types';

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

function normalizeName(raw: string): string {
  return raw.trim().toLowerCase();
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

/** Convierte un numeric de teléfono (ej. 7875550101) al formato (787) 555-0101 */
function formatPhone(raw: number | string): string {
  const digits = String(raw).replace(/\D/g, '');
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return digits;
}

/** Convierte un timestamp ISO al formato "DD Mes YYYY" en español */
function formatDisplayDate(iso: string): string {
  if (!iso) return '';
  const date = new Date(iso);
  return date.toLocaleDateString('es-ES', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

/** Convierte un timestamp ISO a "YYYY-MM-DD" para el campo createdAt */
function toDateString(iso: string): string {
  if (!iso) return '';
  return iso.split('T')[0];
}

/** Mapea una fila de Supabase (join receipt + client) al tipo Order de la app */
function rowToOrder(row: Record<string, unknown>): Order {
  return {
    id: row.id_order as string,
    publicId: (row.public_id as string | undefined) ?? undefined,
    orderNumber: String(row.order_number),
    customerName: (row.name as string) ?? '',
    phone: formatPhone(row.phone_number as number),
    estimatedDate: formatDisplayDate(row.deliver_date as string),
    status: (row.status as OrderStatus) ?? 'RECIBIDO',
    rackNumber: (row.rack_number as string | undefined) ?? undefined,
    daysReady: (row.days_ready as number | undefined) ?? undefined,
    createdAt: toDateString(row.order_date as string),
    statusUpdatedAt: row.status_updated_at as string | undefined,
    notes: (row.notes as string | undefined) ?? undefined,
  };
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

  return (data ?? []).map((row) => {
    const clientData = Array.isArray(row.client)
      ? (row.client[0] as { name: string; phone_number: number } | null)
      : (row.client as { name: string; phone_number: number } | null);
    return rowToOrder({
      ...row,
      name: clientData?.name ?? '',
      phone_number: clientData?.phone_number ?? 0,
    });
  });
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

  const rawPhone = parseInt(rawPhoneDigits, 10);
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
  const clientId = crypto.randomUUID();

  const { data: existingReceipt, error: receiptQueryError } = await supabase
    .from('receipt')
    .select('id_order')
    .eq('order_number', numericOrderNumber)
    .maybeSingle();

  if (receiptQueryError) {
    console.error('[ordersService] insertOrder (receipt check) error:', receiptQueryError.message);
    return {
      orderId: null,
      publicId: null,
      error: 'Error al verificar el número de orden.',
      code: 'DATABASE_ERROR',
    };
  }

  if (existingReceipt) {
    return {
      orderId: null,
      publicId: null,
      error: `El número de orden ${numericOrderNumber} ya existe.`,
      code: 'ORDER_NUMBER_EXISTS',
    };
  }

  // 1. Buscar cliente existente por número de teléfono
  const { data: existingClient, error: clientQueryError } = await supabase
    .from('client')
    .select('id_client, phone_number, name')
    .eq('phone_number', rawPhone)
    .maybeSingle();

  if (clientQueryError) {
    console.error('[ordersService] insertOrder (client check) error:', clientQueryError.message);
    return {
      orderId: null,
      publicId: null,
      error: 'Error al verificar el teléfono del cliente.',
      code: 'DATABASE_ERROR',
    };
  }

  let resolvedClientId: string;

  if (existingClient?.id_client) {
    if (normalizeName(existingClient.name ?? '') !== normalizeName(order.customerName)) {
      return {
        orderId: null,
        publicId: null,
        error: `No se pudo insertar la orden porque el número ${formatPhone(rawPhone)} ya está registrado en Customer Data Registration con ${existingClient.name}.`,
        code: 'PHONE_NAME_MISMATCH',
      };
    }
    resolvedClientId = existingClient.id_client as string;
  } else {
    const { error: clientError } = await supabase.from('client').insert({
      id_client: clientId,
      phone_number: rawPhone,
      name: order.customerName,
    });

    if (clientError) {
      console.error('[ordersService] insertOrder (client) error:', clientError.message);
      return {
        orderId: null,
        publicId: null,
        error: 'No se pudo crear el cliente.',
        code: 'CLIENT_INSERT_FAILED',
      };
    }

    resolvedClientId = clientId;
  }

  // 3. Insertar la orden (receipt)
  // Convertir estimatedDate de "DD Mes YYYY" a timestamp
  const deliverDate = (() => {
    const parsed = new Date(order.estimatedDate);
    return isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
  })();

  const { error: receiptError } = await supabase.from('receipt').insert({
    id_order: orderId,
    public_id: publicId,
    order_number: numericOrderNumber,
    order_date: new Date().toISOString(),
    deliver_date: deliverDate,
    fk_cliente: resolvedClientId,
    status: order.status,
    status_updated_at: new Date().toISOString(),
    notes: order.notes ?? null,
  });

  if (receiptError) {
    console.error('[ordersService] insertOrder (receipt) error:', receiptError.message);
    return {
      orderId: null,
      publicId: null,
      error: 'No se pudo crear la orden. Verifica que el número de orden no exista.',
      code: 'RECEIPT_INSERT_FAILED',
    };
  }

  return { orderId, publicId };
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

  const clientData = Array.isArray(data.client)
    ? (data.client[0] as { name: string; phone_number: number } | null)
    : (data.client as { name: string; phone_number: number } | null);
  return rowToOrder({
    ...data,
    name: clientData?.name ?? '',
    phone_number: clientData?.phone_number ?? 0,
  });
}
