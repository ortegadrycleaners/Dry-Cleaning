/**
 * Configuración del cliente Twilio (lado frontend).
 *
 * El bundle NO contiene credenciales de Twilio. Solo:
 *   - URL del endpoint backend que sí las custodia.
 *   - Cuotas/limites para guards locales (defensa en profundidad).
 *   - Flags de modo mock / kill switch.
 *
 * Variables (vite, expuestas con prefijo VITE_):
 *
 *   VITE_NOTIFY_ENDPOINT_URL    URL del endpoint backend que dispara Twilio.
 *                               Vacía => modo mock automático.
 *   VITE_NOTIFY_ENDPOINT_KEY    (opcional) API key pública de invocación.
 *                               NUNCA poner aquí el Auth Token de Twilio.
 *   VITE_TWILIO_MOCK            'true' fuerza modo mock incluso con URL.
 *   VITE_SMS_DAILY_BUDGET       Cap diario de SMS (default 200).
 *   VITE_SMS_PER_ORDER_HOURS    Horas mínimas entre SMS para una misma orden (default 24).
 *   VITE_SMS_GLOBAL_PER_MINUTE  Máximo SMS por minuto global (default 30).
 *   VITE_SMS_COOLDOWN_MS        Cooldown anti doble-click (default 5000).
 *   VITE_SMS_ALLOWLIST          CSV de teléfonos E.164 permitidos en pruebas.
 *                               Vacío => no allowlist (modo producción).
 *   VITE_SMS_KILL_SWITCH        'true' deshabilita TODOS los envíos.
 */

export interface TwilioRuntimeConfig {
  endpointUrl: string;
  endpointKey?: string;
  mockMode: boolean;
  dailyBudget: number;
  perOrderCooldownHours: number;
  globalPerMinute: number;
  cooldownMs: number;
  allowlist: string[];
  killSwitch: boolean;
}

/* ---------- Helpers de parseo ---------- */

function readEnv(key: string): string | undefined {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
  return env?.[key];
}

function parseBool(raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined || raw === '') return fallback;
  return raw.trim().toLowerCase() === 'true';
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
}

function parseAllowlist(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/* ---------- Cache ---------- */

let cachedConfig: TwilioRuntimeConfig | null = null;
let cachedKillSwitchOverride: boolean | null = null;

const KILL_SWITCH_OVERRIDE_KEY = 'tintoreria_twilio_kill_switch';

/**
 * Permite a un admin activar el kill switch en runtime sin redeploy.
 * Se persiste en localStorage; cualquier operador con acceso al panel puede
 * activarlo, p.ej. al detectar gasto anómalo.
 */
export function setKillSwitchOverride(value: boolean | null): void {
  cachedKillSwitchOverride = value;
  try {
    if (value === null) {
      localStorage.removeItem(KILL_SWITCH_OVERRIDE_KEY);
    } else {
      localStorage.setItem(KILL_SWITCH_OVERRIDE_KEY, value ? 'true' : 'false');
    }
  } catch {
    /* storage puede estar bloqueado; el override en memoria sigue vigente */
  }
}

function readKillSwitchOverride(): boolean | null {
  if (cachedKillSwitchOverride !== null) return cachedKillSwitchOverride;
  try {
    const raw = localStorage.getItem(KILL_SWITCH_OVERRIDE_KEY);
    if (raw === null) return null;
    return raw === 'true';
  } catch {
    return null;
  }
}

/* ---------- API pública ---------- */

export function getTwilioConfig(): TwilioRuntimeConfig {
  if (cachedConfig) {
    return { ...cachedConfig, killSwitch: cachedConfig.killSwitch || readKillSwitchOverride() === true };
  }

  const endpointUrl = (readEnv('VITE_NOTIFY_ENDPOINT_URL') ?? '').trim();
  const explicitMock = parseBool(readEnv('VITE_TWILIO_MOCK'), false);

  cachedConfig = {
    endpointUrl,
    endpointKey: readEnv('VITE_NOTIFY_ENDPOINT_KEY'),
    mockMode: explicitMock || endpointUrl === '',
    dailyBudget: parsePositiveInt(readEnv('VITE_SMS_DAILY_BUDGET'), 200),
    perOrderCooldownHours: parsePositiveInt(readEnv('VITE_SMS_PER_ORDER_HOURS'), 24),
    globalPerMinute: parsePositiveInt(readEnv('VITE_SMS_GLOBAL_PER_MINUTE'), 30),
    cooldownMs: parsePositiveInt(readEnv('VITE_SMS_COOLDOWN_MS'), 5000),
    allowlist: parseAllowlist(readEnv('VITE_SMS_ALLOWLIST')),
    killSwitch: parseBool(readEnv('VITE_SMS_KILL_SWITCH'), false),
  };

  return {
    ...cachedConfig,
    killSwitch: cachedConfig.killSwitch || readKillSwitchOverride() === true,
  };
}

/** Útil en tests / hot-reload para refrescar la config tras cambios de env. */
export function resetTwilioConfigCache(): void {
  cachedConfig = null;
  cachedKillSwitchOverride = null;
}

/** ¿Está el subsistema configurado para enviar SMS reales? */
export function isTwilioReady(): boolean {
  const cfg = getTwilioConfig();
  return !cfg.mockMode && cfg.endpointUrl !== '';
}
