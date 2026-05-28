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
  | 'DUPLICATE';

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

/** Inserta idempotency; conflicto => DUPLICATE. */
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
  const { error } = await admin.from('sms_sends').insert(row);

  if (error?.code === '23505') {
    return fail('DUPLICATE', 'This notification was already sent (idempotency).');
  }
  if (error) {
    console.error('claimIdempotency error:', error);
    throw new Error(error.message);
  }
  return { ok: true };
}

export async function updateSmsSendSid(
  admin: SupabaseClient,
  idempotencyKey: string,
  messageSid: string,
): Promise<void> {
  await admin.from('sms_sends').update({ message_sid: messageSid }).eq('idempotency_key', idempotencyKey);
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
