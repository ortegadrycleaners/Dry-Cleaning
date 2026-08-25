/**
 * Capas de protección contra envíos incorrectos y sobrecostos en Twilio.
 *
 * Estas son guards LOCALES (frontend). El backend DEBE replicar las mismas
 * comprobaciones (más una verificación con la base de datos canónica) — los
 * controles del frontend son rápidos y mejoran UX, pero un atacante que evite
 * el frontend siempre podría intentar saltarse las guards locales: la
 * autoridad final es siempre el backend.
 *
 * Capas implementadas (defensa en profundidad):
 *   1. Kill switch (env o admin runtime)
 *   2. Validación de configuración
 *   3. Validación de estado de la orden
 *   4. Validación E.164 del teléfono
 *   5. Allowlist en modo prueba
 *   6. Cooldown anti doble-click (ms)
 *   7. Deduplicación persistente por (orderId, type)
 *   8. Rate-limit por orden (horas)
 *   9. Rate-limit global por minuto
 *  10. Presupuesto diario máximo
 */

import type { Order } from '@/types';
import type { NotificationEventType } from '@/types/notifications';
import { getTwilioConfig } from './config';
import { isValidE164, normalizeToE164 } from './phoneValidation';
import type { SmsSendRecord, TwilioErrorCode } from './types';

const HISTORY_KEY = 'tintoreria_sms_history';
const LAST_SEND_AT_KEY = 'tintoreria_sms_last_sent_at';

const HISTORY_RETENTION_MS = 1000 * 60 * 60 * 24 * 7; // 7 días

/* ---------- Persistencia de historial (cuotas / dedup) ---------- */

let historyCache: SmsSendRecord[] | null = null;

function readHistory(): SmsSendRecord[] {
  if (historyCache) return historyCache;
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    const parsed: SmsSendRecord[] = raw ? JSON.parse(raw) : [];
    const cutoff = Date.now() - HISTORY_RETENTION_MS;
    historyCache = parsed.filter((r) => typeof r.sentAt === 'number' && r.sentAt >= cutoff);
    return historyCache;
  } catch {
    historyCache = [];
    return historyCache;
  }
}

function writeHistory(records: SmsSendRecord[]): void {
  historyCache = records;
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(records));
  } catch {
    /* storage puede estar lleno: el cache en memoria sigue vigente */
  }
}

export function recordSmsSent(record: SmsSendRecord): void {
  const records = [record, ...readHistory()];
  writeHistory(records);
  try {
    localStorage.setItem(LAST_SEND_AT_KEY, String(record.sentAt));
  } catch {
    /* idem */
  }
}

export function getSmsHistory(): readonly SmsSendRecord[] {
  return readHistory();
}

/** Útil para limpieza manual o tras cambio de tenant. */
export function clearSmsHistory(): void {
  historyCache = [];
  try {
    localStorage.removeItem(HISTORY_KEY);
    localStorage.removeItem(LAST_SEND_AT_KEY);
  } catch {
    /* no-op */
  }
}

function readLastSendAt(): number {
  try {
    const raw = localStorage.getItem(LAST_SEND_AT_KEY);
    return raw ? Number(raw) : 0;
  } catch {
    return 0;
  }
}

/* ---------- Resultado de la guardia ---------- */

export interface GuardOk {
  ok: true;
}
export interface GuardFail {
  ok: false;
  errorCode: TwilioErrorCode;
  errorMessage: string;
  messageKey: string;
  messageParams?: Record<string, string>;
}
export type GuardResult = GuardOk | GuardFail;

const ok: GuardOk = { ok: true };
const fail = (
  errorCode: TwilioErrorCode,
  errorMessage: string,
  messageKey: string,
  messageParams?: Record<string, string>,
): GuardFail => ({
  ok: false,
  errorCode,
  errorMessage,
  messageKey,
  messageParams,
});

/* ---------- Capas individuales ---------- */

export function checkKillSwitch(): GuardResult {
  return getTwilioConfig().killSwitch
    ? fail(
        'KILL_SWITCH_ON',
        'Envío de SMS deshabilitado por el administrador (kill switch activo).',
        'dashboard.guards.killSwitchOn',
      )
    : ok;
}

export function checkConfig(): GuardResult {
  const cfg = getTwilioConfig();
  if (cfg.mockMode) return ok;
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
  const hasSupabase = Boolean(env?.VITE_SUPABASE_URL?.trim() && env?.VITE_SUPABASE_ANON_KEY?.trim());
  if (!hasSupabase && !cfg.endpointUrl) {
    return fail(
      'NOT_CONFIGURED',
      'Configura VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY, o VITE_NOTIFY_ENDPOINT_URL. Ver TWILIO_SETUP.md.',
      'dashboard.guards.notConfigured',
    );
  }
  return ok;
}

export function checkOrderState(order: Order, type: NotificationEventType): GuardResult {
  if (type === 'ORDER_READY') {
    if (order.status !== 'LISTO') {
      return fail(
        'INVALID_ORDER_STATE',
        `La orden #${order.orderNumber} no está LISTA (estado actual: ${order.status}).`,
        'dashboard.guards.orderNotReady',
        { orderNumber: order.orderNumber, status: order.status },
      );
    }
    if (!order.rackNumber) {
      return fail(
        'INVALID_ORDER_STATE',
        'Falta el número de rack para una orden LISTA. Marca primero la ubicación.',
        'dashboard.guards.missingRackNumber',
      );
    }
  }
  if (type === 'PICKUP_REMINDER' || type === 'URGENT_REMINDER' || type === 'DAY_30_REMINDER') {
    if (order.status !== 'LISTO') {
      return fail(
        'INVALID_ORDER_STATE',
        `La orden #${order.orderNumber} no está LISTA (estado actual: ${order.status}).`,
        'dashboard.guards.orderNotReady',
        { orderNumber: order.orderNumber, status: order.status },
      );
    }
  }
  if (!order.customerName?.trim()) {
    return fail(
      'INVALID_ORDER_STATE',
      'La orden no tiene nombre de cliente asociado.',
      'dashboard.guards.missingCustomerName',
    );
  }
  return ok;
}

export function checkPhone(rawPhone: string): GuardResult {
  const normalized = normalizeToE164(rawPhone);
  if (!normalized || !isValidE164(normalized)) {
    return fail(
      'INVALID_PHONE',
      `El teléfono "${rawPhone}" no es un número válido en formato E.164.`,
      'dashboard.guards.invalidPhoneFormat',
      { phone: rawPhone },
    );
  }
  return ok;
}

export function checkAllowlist(rawPhone: string): GuardResult {
  const cfg = getTwilioConfig();
  if (cfg.allowlist.length === 0) return ok;
  const normalized = normalizeToE164(rawPhone);
  if (!normalized) return fail('INVALID_PHONE', 'Teléfono inválido.', 'dashboard.guards.invalidPhoneGeneric');
  if (!cfg.allowlist.includes(normalized)) {
    return fail(
      'ALLOWLIST_BLOCKED',
      `Modo allowlist activo: ${normalized} no está en la lista permitida (VITE_SMS_ALLOWLIST).`,
      'dashboard.guards.allowlistBlocked',
      { phone: normalized },
    );
  }
  return ok;
}

export function checkCooldown(): GuardResult {
  const cfg = getTwilioConfig();
  const since = Date.now() - readLastSendAt();
  if (since < cfg.cooldownMs) {
    const wait = Math.ceil((cfg.cooldownMs - since) / 1000);
    return fail(
      'COOLDOWN_ACTIVE',
      `Espera ${wait}s antes de enviar otro SMS (protección anti doble-click).`,
      'dashboard.guards.cooldownActive',
      { wait: String(wait) },
    );
  }
  return ok;
}

export function checkDuplicate(orderId: string, type: NotificationEventType): GuardResult {
  const exists = readHistory().some((r) => r.orderId === orderId && r.templateType === type);
  if (exists) {
    return fail(
      'DUPLICATE',
      'Ya se envió esta notificación para esta orden. No se reenvía para evitar duplicados.',
      'dashboard.guards.duplicate',
    );
  }
  return ok;
}

export function checkPerOrderRateLimit(orderId: string): GuardResult {
  const cfg = getTwilioConfig();
  const cutoff = Date.now() - cfg.perOrderCooldownHours * 3_600_000;
  const recent = readHistory().some((r) => r.orderId === orderId && r.sentAt >= cutoff);
  if (recent) {
    return fail(
      'RATE_LIMIT_PER_ORDER',
      `Ya se envió un SMS para esta orden en las últimas ${cfg.perOrderCooldownHours} horas.`,
      'dashboard.guards.rateLimitPerOrder',
      { hours: String(cfg.perOrderCooldownHours) },
    );
  }
  return ok;
}

export function checkGlobalPerMinute(): GuardResult {
  const cfg = getTwilioConfig();
  const cutoff = Date.now() - 60_000;
  const count = readHistory().filter((r) => r.sentAt >= cutoff).length;
  if (count >= cfg.globalPerMinute) {
    return fail(
      'RATE_LIMIT_GLOBAL',
      `Se alcanzó el máximo de ${cfg.globalPerMinute} SMS por minuto. Espera unos segundos.`,
      'dashboard.guards.rateLimitGlobal',
      { cap: String(cfg.globalPerMinute) },
    );
  }
  return ok;
}

export function checkDailyBudget(): GuardResult {
  const cfg = getTwilioConfig();
  const cutoff = Date.now() - 86_400_000;
  const count = readHistory().filter((r) => r.sentAt >= cutoff).length;
  if (count >= cfg.dailyBudget) {
    return fail(
      'DAILY_BUDGET_EXCEEDED',
      `Presupuesto diario agotado (${cfg.dailyBudget} SMS/24h). Solicita aumentar la cuota o intenta mañana.`,
      'dashboard.guards.dailyBudgetExceeded',
      { budget: String(cfg.dailyBudget) },
    );
  }
  return ok;
}

/* ---------- Pipeline completo ---------- */

/**
 * Ejecuta todas las guardas en orden. Devuelve el primer fallo encontrado (fail-fast).
 * Si pasa todas, retorna { ok: true }.
 */
export function runAllGuards(
  order: Order,
  type: NotificationEventType,
): GuardResult {
  const checks: Array<() => GuardResult> = [
    checkKillSwitch,
    checkConfig,
    () => checkOrderState(order, type),
    () => checkPhone(order.phone),
    () => checkAllowlist(order.phone),
    checkCooldown,
    () => checkDuplicate(order.id, type),
    () => checkPerOrderRateLimit(order.id),
    checkGlobalPerMinute,
    checkDailyBudget,
  ];

  for (const check of checks) {
    const result = check();
    if (!result.ok) return result;
  }
  return ok;
}

/* ---------- Estadísticas para UI / observabilidad ---------- */

export interface SmsUsageStats {
  sentLastMinute: number;
  sentLastDay: number;
  remainingDailyBudget: number;
  globalPerMinuteCap: number;
  dailyBudget: number;
  killSwitch: boolean;
  mockMode: boolean;
}

export function getUsageStats(): SmsUsageStats {
  const cfg = getTwilioConfig();
  const now = Date.now();
  const sentLastMinute = readHistory().filter((r) => r.sentAt >= now - 60_000).length;
  const sentLastDay = readHistory().filter((r) => r.sentAt >= now - 86_400_000).length;
  return {
    sentLastMinute,
    sentLastDay,
    remainingDailyBudget: Math.max(0, cfg.dailyBudget - sentLastDay),
    globalPerMinuteCap: cfg.globalPerMinute,
    dailyBudget: cfg.dailyBudget,
    killSwitch: cfg.killSwitch,
    mockMode: cfg.mockMode,
  };
}
