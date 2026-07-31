/**
 * Guards servidor para envío SMS (autoridad final; el cliente es defensa UX).
 */

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { isValidE164, normalizeToE164 } from './phoneValidation.ts';

export type TwilioErrorCode =
  | 'KILL_SWITCH_ON'
  | 'DAILY_BUDGET_EXCEEDED'
  | 'RATE_LIMIT_GLOBAL'
  | 'ALLOWLIST_BLOCKED'
  | 'INVALID_PHONE'
  | 'DUPLICATE'
  | 'OPTED_OUT';

export interface GuardFail {
  ok: false;
  errorCode: TwilioErrorCode;
  errorMessage: string;
}

export interface GuardOk {
  ok: true;
}

export type GuardResult = GuardOk | GuardFail;

const fail = (errorCode: TwilioErrorCode, errorMessage: string): GuardFail => ({
  ok: false,
  errorCode,
  errorMessage,
});

function parseBool(raw: string | undefined, fallback: boolean): boolean {
  if (!raw) return fallback;
  return raw.trim().toLowerCase() === 'true';
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
}

function parseAllowlist(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

export function getServerSmsConfig() {
  return {
    killSwitch: parseBool(Deno.env.get('SMS_KILL_SWITCH'), false),
    dailyBudget: parsePositiveInt(Deno.env.get('SMS_DAILY_BUDGET'), 200),
    globalPerMinute: parsePositiveInt(Deno.env.get('SMS_GLOBAL_PER_MINUTE'), 30),
    allowlist: parseAllowlist(Deno.env.get('SMS_ALLOWLIST')),
  };
}

export function checkKillSwitch(): GuardResult {
  return getServerSmsConfig().killSwitch
    ? fail('KILL_SWITCH_ON', 'SMS disabled by administrator (kill switch).')
    : { ok: true };
}

export function checkAllowlist(phoneE164: string): GuardResult {
  const { allowlist } = getServerSmsConfig();
  if (allowlist.length === 0) return { ok: true };
  if (!allowlist.includes(phoneE164)) {
    return fail('ALLOWLIST_BLOCKED', `Phone ${phoneE164} is not in SMS_ALLOWLIST.`);
  }
  return { ok: true };
}

export function checkPhone(raw: string): GuardResult {
  const normalized = normalizeToE164(raw);
  if (!normalized || !isValidE164(normalized)) {
    return fail('INVALID_PHONE', `Invalid phone: ${raw}`);
  }
  return { ok: true };
}

/** Blocks sends to numbers that replied STOP (see twilio-inbound-sms). */
export async function checkOptOut(admin: SupabaseClient, phoneE164: string): Promise<GuardResult> {
  const { data, error } = await admin
    .from('sms_opt_out')
    .select('phone_e164')
    .eq('phone_e164', phoneE164)
    .maybeSingle();

  if (error) {
    console.error('checkOptOut error:', error);
    return { ok: true };
  }
  if (data) {
    return fail('OPTED_OUT', `Phone ${phoneE164} opted out of SMS (replied STOP).`);
  }
  return { ok: true };
}

export async function checkDailyBudget(admin: SupabaseClient): Promise<GuardResult> {
  const { dailyBudget } = getServerSmsConfig();
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);

  const { count, error } = await admin
    .from('sms_sends')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', since.toISOString());

  if (error) {
    console.error('checkDailyBudget error:', error);
    return { ok: true };
  }

  if ((count ?? 0) >= dailyBudget) {
    return fail('DAILY_BUDGET_EXCEEDED', `Daily SMS budget exhausted (${dailyBudget}/24h).`);
  }
  return { ok: true };
}

export async function checkGlobalPerMinute(admin: SupabaseClient): Promise<GuardResult> {
  const { globalPerMinute } = getServerSmsConfig();
  const since = new Date(Date.now() - 60_000).toISOString();

  const { count, error } = await admin
    .from('sms_sends')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', since);

  if (error) {
    console.error('checkGlobalPerMinute error:', error);
    return { ok: true };
  }

  if ((count ?? 0) >= globalPerMinute) {
    return fail('RATE_LIMIT_GLOBAL', `Max ${globalPerMinute} SMS per minute reached.`);
  }
  return { ok: true };
}

/**
 * Inserta idempotency; conflicto => DUPLICATE, salvo que el intento previo
 * haya fallado (status='failed'), en cuyo caso se reclama de nuevo para
 * permitir un reintento en vez de perder el envío para siempre.
 */
export async function claimIdempotency(
  admin: SupabaseClient,
  row: {
    idempotency_key: string;
    order_id: string;
    template_type: string;
    operator_id: string | null;
    phone: string | null;
  },
): Promise<GuardResult> {
  const { error } = await admin.from('sms_sends').insert({ ...row, status: 'claimed' });

  if (!error) return { ok: true };

  if (error.code !== '23505') {
    console.error('claimIdempotency error:', error);
    throw new Error(error.message);
  }

  const { data, error: reclaimError } = await admin
    .from('sms_sends')
    .update({
      status: 'claimed',
      error_code: null,
      error_message: null,
      created_at: new Date().toISOString(),
    })
    .eq('idempotency_key', row.idempotency_key)
    .eq('status', 'failed')
    .select('idempotency_key');

  if (reclaimError) {
    console.error('claimIdempotency reclaim error:', reclaimError);
    throw new Error(reclaimError.message);
  }

  if ((data?.length ?? 0) > 0) return { ok: true };
  return fail('DUPLICATE', 'This notification was already sent (idempotency).');
}

export async function updateSmsSendSid(
  admin: SupabaseClient,
  idempotencyKey: string,
  messageSid: string,
): Promise<void> {
  await admin
    .from('sms_sends')
    .update({ message_sid: messageSid, status: 'sent', status_updated_at: new Date().toISOString() })
    .eq('idempotency_key', idempotencyKey);
}

/** Persiste un rechazo inmediato de Twilio (antes de obtener sid) en sms_sends. */
export async function markSmsSendFailed(
  admin: SupabaseClient,
  idempotencyKey: string,
  info: { errorCode?: string | null; errorMessage: string },
): Promise<void> {
  const { error } = await admin
    .from('sms_sends')
    .update({
      status: 'failed',
      error_code: info.errorCode ?? null,
      error_message: info.errorMessage,
      status_updated_at: new Date().toISOString(),
    })
    .eq('idempotency_key', idempotencyKey);

  if (error) console.error('markSmsSendFailed error:', error);
}

/** Persiste el resultado de un intento de recordatorio automático en receipt_notification. */
export async function markReminderNotificationResult(
  admin: SupabaseClient,
  idempotencyKey: string,
  result:
    | { status: 'sent'; messageSid: string }
    | { status: 'failed'; errorCode?: string | null; errorMessage: string },
): Promise<void> {
  const patch =
    result.status === 'sent'
      ? {
          status: 'sent',
          message_sid: result.messageSid,
          sent_at: new Date().toISOString(),
          error_code: null,
          error_message: null,
        }
      : {
          status: 'failed',
          error_code: result.errorCode ?? null,
          error_message: result.errorMessage,
        };

  const { error } = await admin.from('receipt_notification').update(patch).eq('idempotency_key', idempotencyKey);
  if (error) console.error('markReminderNotificationResult error:', error);
}

export interface StatusCallbackUpdate {
  status: string;
  errorCode?: string | null;
  errorMessage?: string | null;
}

/** Applied by the twilio-status-callback webhook; matched by message_sid. */
export async function updateSmsSendStatus(
  admin: SupabaseClient,
  messageSid: string,
  update: StatusCallbackUpdate,
): Promise<{ matched: boolean }> {
  const { data, error } = await admin
    .from('sms_sends')
    .update({
      status: update.status,
      error_code: update.errorCode ?? null,
      error_message: update.errorMessage ?? null,
      status_updated_at: new Date().toISOString(),
    })
    .eq('message_sid', messageSid)
    .select('idempotency_key');

  if (error) {
    console.error('updateSmsSendStatus error:', error);
    return { matched: false };
  }
  return { matched: (data?.length ?? 0) > 0 };
}

export async function runServerGuards(
  admin: SupabaseClient,
  phoneRaw: string,
): Promise<{ result: GuardResult; phoneE164: string | null }> {
  const checks: Array<() => GuardResult | Promise<GuardResult>> = [
    checkKillSwitch,
    () => checkPhone(phoneRaw),
    async () => {
      const normalized = normalizeToE164(phoneRaw);
      return normalized ? checkAllowlist(normalized) : fail('INVALID_PHONE', 'Invalid phone');
    },
    async () => {
      const normalized = normalizeToE164(phoneRaw);
      return normalized ? checkOptOut(admin, normalized) : fail('INVALID_PHONE', 'Invalid phone');
    },
    () => checkDailyBudget(admin),
    () => checkGlobalPerMinute(admin),
  ];

  let phoneE164: string | null = null;
  for (const check of checks) {
    const result = await check();
    if (!result.ok) return { result, phoneE164 };
  }
  phoneE164 = normalizeToE164(phoneRaw);
  return { result: { ok: true }, phoneE164 };
}
