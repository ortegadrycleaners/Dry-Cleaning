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
import type { Order, OrderStatus } from '@/types';

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
    orderNumber: String(row.order_number),
    customerName: (row.name as string) ?? '',
    phone: formatPhone(row.phone_number as number),
    estimatedDate: formatDisplayDate(row.deliver_date as string),
    status: (row.status as OrderStatus) ?? 'RECIBIDO',
    rackNumber: (row.rack_number as string | undefined) ?? undefined,
    daysReady: (row.days_ready as number | undefined) ?? undefined,
    createdAt: toDateString(row.order_date as string),
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
      rack_number,
      days_ready,
      notes,
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
export async function insertOrder(order: Order): Promise<string | null> {
  const rawPhone = parseInt(order.phone.replace(/\D/g, ''), 10);
  const orderId = crypto.randomUUID();
  const clientId = crypto.randomUUID();

  // 1. Buscar cliente existente por número de teléfono
  const { data: existing } = await supabase
    .from('client')
    .select('id_client')
    .eq('phone_number', rawPhone)
    .maybeSingle();

  let resolvedClientId: string;

  if (existing?.id_client) {
    resolvedClientId = existing.id_client as string;
  } else {
    // 2. Crear cliente nuevo
    const { error: clientError } = await supabase.from('client').insert({
      id_client: clientId,
      phone_number: rawPhone,
      name: order.customerName,
    });
    if (clientError) {
      console.error('[ordersService] insertOrder (client) error:', clientError.message);
      return null;
    }
    resolvedClientId = clientId;
  }

  // 3. Insertar la orden (receipt)
  // Convertir estimatedDate de "DD Mes YYYY" a timestamp
  const deliverDate = (() => {
    // El campo viene como "06 Abr 2026" — parseamos con new Date()
    const parsed = new Date(order.estimatedDate);
    return isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
  })();

  const { error: receiptError } = await supabase.from('receipt').insert({
    id_order: orderId,
    order_number: parseInt(order.orderNumber, 10) || 0,
    order_date: new Date().toISOString(),
    deliver_date: deliverDate,
    fk_cliente: resolvedClientId,
    status: order.status,
    notes: order.notes ?? null,
  });

  if (receiptError) {
    console.error('[ordersService] insertOrder (receipt) error:', receiptError.message);
    return null;
  }

  return orderId;
}

/** Actualiza el estado de una orden y opcionalmente el número de rack */
export async function updateOrderStatusInDb(
  orderId: string,
  status: OrderStatus,
  rackNumber?: string
): Promise<boolean> {
  const updates: Record<string, unknown> = { status };
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
      order_number,
      order_date,
      deliver_date,
      status,
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
