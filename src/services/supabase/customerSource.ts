/**
 * customerSource — Adaptador de la fuente canónica del cliente.
 *
 * Lee de Supabase la tabla "client" uniendo con "receipt" para obtener
 * el teléfono y nombre del cliente asociado a una orden.
 */

import { supabase } from '@/lib/supabase';

export interface CustomerRecord {
  /** Nombre tal como debe aparecer en el SMS. */
  name: string;
  /** Teléfono en E.164. */
  phone: string;
  /** Si el cliente pidió no recibir SMS (opt-out). */
  smsOptOut?: boolean;
}

/** Convierte un numeric de teléfono a formato E.164 para Twilio (+17875550101) */
function toE164(raw: number | string): string {
  const digits = String(raw).replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return `+${digits}`;
}

/**
 * Obtiene el cliente asociado a una orden consultando Supabase.
 *
 * @param orderId - id_order (UUID) de la orden.
 * @returns El cliente o null si no se encontró.
 */
export async function getCustomerForOrder(orderId: string): Promise<CustomerRecord | null> {
  const { data, error } = await supabase
    .from('receipt')
    .select(`
      client:fk_cliente (
        name,
        phone_number
      )
    `)
    .eq('id_order', orderId)
    .maybeSingle();

  if (error || !data) {
    console.error('[customerSource] getCustomerForOrder error:', error?.message);
    return null;
  }

  const client = Array.isArray(data.client)
    ? (data.client[0] as { name: string; phone_number: number } | null)
    : (data.client as { name: string; phone_number: number } | null);

  if (!client) return null;

  return {
    name: client.name ?? '',
    phone: toE164(client.phone_number),
    smsOptOut: false,
  };
}
