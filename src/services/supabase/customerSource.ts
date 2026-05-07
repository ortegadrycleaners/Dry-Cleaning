/**
 * customerSource — Adaptador de la fuente canónica del cliente.
 *
 * En producción esto debe leer de Supabase (tabla `customers` / `orders`).
 * Hoy es un stub que retorna null para que el TwilioService caiga al dato
 * de la orden in-memory; cuando se conecte Supabase se reemplaza la
 * implementación SIN cambiar la firma.
 *
 * Importante: el frontend NO debe ser la única fuente de verdad. El backend
 * que dispara Twilio DEBE volver a leer de Supabase para el envío real —
 * este módulo solo provee información para el preview que ve el operador.
 */

export interface CustomerRecord {
  /** Nombre tal como debe aparecer en el SMS. */
  name: string;
  /** Teléfono en E.164. */
  phone: string;
  /** Si el cliente pidió no recibir SMS (opt-out). */
  smsOptOut?: boolean;
}

/**
 * Obtiene el cliente asociado a una orden.
 *
 * @param orderId ID interno de la orden.
 * @returns El cliente o null si Supabase no está conectado / no hay match.
 */
export async function getCustomerForOrder(orderId: string): Promise<CustomerRecord | null> {
  // Stub: el ID se ignora hasta que se conecte Supabase. Se conserva en la
  // firma porque es la API pública del adaptador.
  void orderId;
  // TODO(supabase): reemplazar por:
  //
  //   const { data, error } = await supabase
  //     .from('orders')
  //     .select('customer:customers(name, phone, sms_opt_out)')
  //     .eq('id', orderId)
  //     .single();
  //   if (error || !data?.customer) return null;
  //   return {
  //     name: data.customer.name,
  //     phone: data.customer.phone,
  //     smsOptOut: data.customer.sms_opt_out ?? false,
  //   };
  return null;
}
