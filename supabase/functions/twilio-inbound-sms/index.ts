/**
 * Twilio inbound SMS webhook: handles opt-out/opt-in compliance keywords.
 * Point the Twilio number's "A message comes in" webhook (Messaging config)
 * at this function so replies to our SMS are actually processed instead of
 * falling back to Twilio's default demo auto-response (error 30039 in
 * docs/TWILIO_DIAGNOSTICS.md).
 *
 * Deploy: supabase functions deploy twilio-inbound-sms --no-verify-jwt
 * Secrets: TWILIO_AUTH_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (auto)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { normalizeToE164 } from '../_shared/phoneValidation.ts';
import { formDataToParams, validateTwilioSignature } from '../_shared/twilioSignature.ts';

const TWILIO_AUTH_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

// Twilio's standard opt-out/opt-in keyword set (case-insensitive, exact match).
const STOP_KEYWORDS = new Set(['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT']);
const START_KEYWORDS = new Set(['START', 'YES', 'UNSTOP']);

function escapeXml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function twiml(message?: string): Response {
  const body = message
    ? `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapeXml(message)}</Message></Response>`
    : `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`;
  return new Response(body, { status: 200, headers: { 'Content-Type': 'text/xml' } });
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const rawBody = await req.text();
  const form = new URLSearchParams(rawBody);
  const params = formDataToParams(form);

  const signature = req.headers.get('X-Twilio-Signature');
  const isValid = await validateTwilioSignature(TWILIO_AUTH_TOKEN, signature, req.url, params);
  if (!isValid) {
    console.error('twilio-inbound-sms: invalid signature');
    return new Response('Forbidden', { status: 403 });
  }

  const phoneE164 = normalizeToE164(params.From);
  const keyword = (params.Body ?? '').trim().toUpperCase();

  if (!phoneE164) {
    console.error('twilio-inbound-sms: could not normalize From:', params.From);
    return twiml();
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  if (STOP_KEYWORDS.has(keyword)) {
    const { error } = await admin
      .from('sms_opt_out')
      .upsert(
        { phone_e164: phoneE164, opted_out_at: new Date().toISOString(), last_keyword: keyword },
        { onConflict: 'phone_e164' },
      );
    if (error) {
      console.error('twilio-inbound-sms: opt-out upsert failed:', error);
    } else {
      console.log(`twilio-inbound-sms: ${phoneE164} opted out (${keyword})`);
    }
    return twiml('You have been unsubscribed and will not receive further SMS. Reply START to resubscribe.');
  }

  if (START_KEYWORDS.has(keyword)) {
    const { error } = await admin.from('sms_opt_out').delete().eq('phone_e164', phoneE164);
    if (error) {
      console.error('twilio-inbound-sms: opt-in delete failed:', error);
    } else {
      console.log(`twilio-inbound-sms: ${phoneE164} opted back in (${keyword})`);
    }
    return twiml('You are resubscribed to SMS updates. Reply STOP to opt out at any time.');
  }

  // Any other inbound text (HELP or free text): acknowledge with an empty
  // TwiML response so Twilio does not fall back to its default demo reply.
  return twiml();
});
