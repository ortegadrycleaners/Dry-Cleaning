/**
 * Twilio status-callback webhook: tracks delivery state for SMS sent via
 * send-reminder-sms / send-reminders (queued -> sent -> delivered/failed).
 * Deploy: supabase functions deploy twilio-status-callback --no-verify-jwt
 * Secrets: TWILIO_AUTH_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (auto)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { updateSmsSendStatus } from '../_shared/guards.ts';
import { formDataToParams, validateTwilioSignature } from '../_shared/twilioSignature.ts';

const TWILIO_AUTH_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

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
    console.error('twilio-status-callback: invalid signature');
    return new Response('Forbidden', { status: 403 });
  }

  const messageSid = params.MessageSid;
  const status = params.MessageStatus;
  const errorCode = params.ErrorCode || null;
  const errorMessage = params.ErrorMessage || null;

  if (!messageSid || !status) {
    return new Response('Missing MessageSid/MessageStatus', { status: 400 });
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { matched } = await updateSmsSendStatus(admin, messageSid, { status, errorCode, errorMessage });
  if (!matched) {
    console.warn(`twilio-status-callback: no sms_sends row for message_sid=${messageSid}`);
  }

  if (status === 'failed' || status === 'undelivered') {
    console.error(`SMS ${messageSid} ${status}${errorCode ? ` (${errorCode}: ${errorMessage})` : ''}`);
  }

  return new Response(null, { status: 204 });
});
