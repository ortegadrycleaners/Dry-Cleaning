/**
 * customersService.ts — Busca clientes en la tabla "client" de Supabase.
 *
 * Usado por NewOrderPage para el autocompletado de teléfono.
 */

import { supabase } from '@/lib/supabase';
import type { Customer } from '@/types';

/** Convierte un numeric de teléfono al formato (787) 555-0101 */
function formatPhone(raw: number | string): string {
  const digits = String(raw).replace(/\D/g, '');
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return digits;
}

function normalizePhoneDigits(value: string): string {
  return String(value).replace(/\D/g, '');
}

export async function findCustomerByPhone(phone: string): Promise<{ phone: string; name: string } | null> {
  const digits = normalizePhoneDigits(phone);
  if (!digits) {
    return null;
  }

  const rawPhone = parseInt(digits, 10);
  const { data, error } = await supabase
    .from('client')
    .select('phone_number, name')
    .eq('phone_number', rawPhone)
    .maybeSingle();

  if (error) {
    console.error('[customersService] findCustomerByPhone error:', error.message);
    return null;
  }

  if (!data) {
    return null;
  }

  return {
    phone: formatPhone(data.phone_number),
    name: data.name ?? '',
  };
}

/**
 * Busca clientes cuyo phone_number contiene el texto de búsqueda.
 * El query limpia caracteres no numéricos para comparar dígitos.
 *
 * @param query - Texto que escribe el usuario (puede incluir paréntesis, guiones, etc.)
 * @returns Lista de Customer para el autocompletado.
 */
export async function searchCustomersByPhone(query: string): Promise<Customer[]> {
  // Limpiar query a solo dígitos para buscar en el campo numeric
  const digits = query.replace(/\D/g, '');

  if (!digits) {
    // Sin query, retornar los últimos 10 clientes
    const { data, error } = await supabase
      .from('client')
      .select('phone_number, name')
      .order('name', { ascending: true })
      .limit(10);

    if (error || !data) return [];
    return data.map((row) => ({
      phone: formatPhone(row.phone_number),
      lastName: row.name ?? '',
    }));
  }

  // Buscar clientes cuyo phone_number contiene los dígitos dados.
  // Aunque la columna es numeric, intentamos usar LIKE de forma directa.
  const { data, error } = await supabase
    .from('client')
    .select('phone_number, name')
    .like('phone_number', `%${digits}%`)
    .limit(10);

  if (error) {
    console.error('[customersService] searchCustomersByPhone error:', error.message);
    const { data: fallbackData, error: fallbackError } = await supabase
      .from('client')
      .select('phone_number, name')
      .order('name', { ascending: true })
      .limit(200);

    if (fallbackError || !fallbackData) {
      return [];
    }

    return fallbackData
      .filter((row) => String(row.phone_number).includes(digits))
      .slice(0, 10)
      .map((row) => ({
        phone: formatPhone(row.phone_number),
        lastName: row.name ?? '',
      }));
  }

  return (data ?? []).map((row) => ({
    phone: formatPhone(row.phone_number),
    lastName: row.name ?? '',
  }));
}
