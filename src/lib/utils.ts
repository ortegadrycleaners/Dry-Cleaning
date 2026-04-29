import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { Order } from '@/types';

// Base62 charset
const BASE62 = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

// Genera un hash base62 a partir de un string y una llave dinámica
export function generateBase62Hash(input: string, key: string): string {
  // Simple hash combinando input y key
  let hash = 0;
  const str = input + key;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) & 0xffffffff;
  }
  // Convierte el hash a base62
  let result = '';
  let n = Math.abs(hash);
  do {
    result = BASE62[n % 62] + result;
    n = Math.floor(n / 62);
  } while (n > 0);
  return result;
}

/** Ticket visible (#número) frente al id opaco en URL/contexto. */
export function orderTicketLabel(order: Pick<Order, 'orderNumber' | 'id'>): string {
  const n = order.orderNumber?.trim();
  return n || order.id;
}

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
