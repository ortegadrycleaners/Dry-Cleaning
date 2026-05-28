const DEFAULT_COUNTRY_CODE = '1';

function digitsOnly(input: string): string {
  return input.replace(/\D+/g, '');
}

function isValidE164Digits(digits: string): boolean {
  return /^\d{8,15}$/.test(digits) && !/^0/.test(digits);
}

/** Normaliza a E.164 (+1 default para PR/US). */
export function normalizeToE164(
  raw: string | null | undefined,
  defaultCountryCode = DEFAULT_COUNTRY_CODE,
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

  if (digits.length === 10) {
    digits = `${defaultCountryCode}${digits}`;
  } else if (digits.length === 11 && digits.startsWith(defaultCountryCode)) {
    // ok
  } else if (digits.length < 8 || digits.length > 15) {
    return null;
  }

  return isValidE164Digits(digits) ? `+${digits}` : null;
}

export function isValidE164(value: string | null | undefined): boolean {
  if (!value?.startsWith('+')) return false;
  return isValidE164Digits(value.slice(1));
}
