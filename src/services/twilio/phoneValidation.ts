/**
 * Validación y normalización de números a formato E.164.
 *
 * Twilio rechaza (y a veces cobra) números mal formados; validamos en el
 * cliente para no llegar siquiera a la API. La normalización asume default
 * country code +1 (PR/US) y permite override.
 */

const DEFAULT_COUNTRY_CODE = '1';

/** Solo dígitos, sin separadores. */
function digitsOnly(input: string): string {
  return input.replace(/\D+/g, '');
}

/**
 * Normaliza a E.164. Acepta entradas como:
 *   "(787) 555-0101"      => "+17875550101"
 *   "787-555-0101"        => "+17875550101"
 *   "+1 787 555 0101"     => "+17875550101"
 *   "+447911123456"       => "+447911123456"
 *
 * Retorna null si no se puede normalizar a un E.164 válido.
 */
export function normalizeToE164(
  raw: string | null | undefined,
  defaultCountryCode: string = DEFAULT_COUNTRY_CODE,
): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('+')) {
    const digits = digitsOnly(trimmed);
    return isValidE164Digits(digits) ? `+${digits}` : null;
  }

  let digits = digitsOnly(trimmed);
  if (digits.length === 0) return null;

  // Caso típico US/PR: 10 dígitos sin country code.
  if (digits.length === 10) {
    digits = `${defaultCountryCode}${digits}`;
  } else if (digits.length === 11 && digits.startsWith(defaultCountryCode)) {
    // ya trae country code sin '+'
  } else if (digits.length < 8 || digits.length > 15) {
    return null;
  }

  return isValidE164Digits(digits) ? `+${digits}` : null;
}

/** E.164: 8 a 15 dígitos sin '+'. */
function isValidE164Digits(digits: string): boolean {
  return /^\d{8,15}$/.test(digits) && !/^0/.test(digits);
}

/** Validación estricta: el número YA viene en E.164. */
export function isValidE164(value: string | null | undefined): boolean {
  if (!value) return false;
  if (!value.startsWith('+')) return false;
  return isValidE164Digits(value.slice(1));
}
