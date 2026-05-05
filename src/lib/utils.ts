import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { Order } from '@/types';

// Base62 charset
const BASE62 = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** Genera un id público alfanumérico (Base62) usando `crypto.getRandomValues`. */
export function generatePublicId(length = 12): string {
  if (!Number.isInteger(length) || length < 1 || length > 48) {
    throw new Error('generatePublicId: length debe estar entre 1 y 48');
  }

  // Rejection sampling para evitar sesgo por módulo.
  const alphabet = BASE62;
  const max = alphabet.length; // 62
  const threshold = 256 - (256 % max); // 248

  let id = '';
  while (id.length < length) {
    const buf = new Uint8Array(32);
    crypto.getRandomValues(buf);
    for (const byte of buf) {
      if (byte >= threshold) continue;
      id += alphabet[byte % max];
      if (id.length === length) break;
    }
  }

  return id;
}

/** Ticket visible (#número) frente al id opaco en URL/contexto. */
export function orderTicketLabel(order: Pick<Order, 'orderNumber' | 'id'>): string {
  const n = order.orderNumber?.trim();
  return n || order.id;
}

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
