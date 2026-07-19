/**
 * Validates the X-Twilio-Signature header per Twilio's request-validation
 * algorithm: HMAC-SHA1(authToken, url + sorted(key+value for each POST param)),
 * base64-encoded. https://www.twilio.com/docs/usage/webhooks/webhooks-security
 */

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export async function validateTwilioSignature(
  authToken: string,
  signature: string | null,
  url: string,
  params: Record<string, string>,
): Promise<boolean> {
  if (!authToken || !signature) return false;

  let data = url;
  for (const key of Object.keys(params).sort()) {
    data += key + params[key];
  }

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(authToken),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign'],
  );
  const sigBuffer = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  const computed = btoa(String.fromCharCode(...new Uint8Array(sigBuffer)));

  return timingSafeEqual(computed, signature);
}

export function formDataToParams(form: URLSearchParams): Record<string, string> {
  const params: Record<string, string> = {};
  for (const [key, value] of form.entries()) {
    params[key] = value;
  }
  return params;
}
