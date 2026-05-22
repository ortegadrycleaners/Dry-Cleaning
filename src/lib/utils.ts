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

import type { Locale } from '@/i18n';

export function formatElapsedTime(date: Date, locale: Locale = 'es', base = new Date()): string {
  const diffMs = Math.max(0, base.getTime() - date.getTime());
  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  const isSpanish = locale === 'es';

  if (seconds < 10) return isSpanish ? 'unos segundos' : 'a few seconds';
  if (seconds < 60) return isSpanish ? `${seconds} segundos` : `${seconds} seconds`;
  if (minutes === 1) return isSpanish ? 'un minuto' : 'one minute';
  if (minutes < 60) return isSpanish ? `${minutes} minutos` : `${minutes} minutes`;
  if (hours === 1) return isSpanish ? 'una hora' : 'one hour';
  if (hours < 24) return isSpanish ? `${hours} horas` : `${hours} hours`;
  if (days === 1) return isSpanish ? 'un día' : 'one day';
  return isSpanish ? `${days} días` : `${days} days`;
}

export function daysSince(value?: string | Date, base = new Date()): number | null {
  if (!value) return null;
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return null;
  const diffMs = Math.max(0, base.getTime() - date.getTime());
  return Math.floor(diffMs / 86_400_000);
}

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
