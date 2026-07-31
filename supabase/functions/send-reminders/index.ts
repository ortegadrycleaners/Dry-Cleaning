/**
 * Batch reminder runner: claims due reminders and sends SMS via Twilio.
 * Deploy: supabase functions deploy send-reminders --no-verify-jwt
 * Invoke: POST with ?tz=America/Puerto_Rico (optional)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { renderTemplate } from '../_shared/messageTemplates.ts';
import {
  runServerGuards,
  claimIdempotency,
  updateSmsSendSid,
  markSmsSendFailed,
  markReminderNotificationResult,
} from '../_shared/guards.ts';
import { normalizeToE164, isValidE164 } from '../_shared/phoneValidation.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const TWILIO_ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID') ?? '';
const TWILIO_AUTH_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN') ?? '';
const TWILIO_MESSAGING_SERVICE_SID = Deno.env.get('TWILIO_MESSAGING_SERVICE_SID') ?? '';
const PUBLIC_APP_URL = (Deno.env.get('PUBLIC_APP_URL') ?? '').replace(/\/$/, '');
const BRAND_NAME = Deno.env.get('BRAND_NAME') ?? 'Ortega Cleaners';
const STORE_PHONE = Deno.env.get('STORE_PHONE') ?? '(904) 666-0809';
const STATUS_CALLBACK_URL =
  Deno.env.get('TWILIO_STATUS_CALLBACK_URL') ||
  (SUPABASE_URL ? `${SUPABASE_URL}/functions/v1/twilio-status-callback` : '');

async function sendTwilioSms(to: string, body: string): Promise<{ sid: string }> {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
    throw new Error('Twilio is not configured on the server (missing SID/Token)');
  }
  if (!TWILIO_MESSAGING_SERVICE_SID) {
    // Sending via a raw From number instead of the Messaging Service triggers
    // Twilio error 30034 (US A2P 10DLC - message from an unregistered number).
    throw new Error(
      'Twilio is not configured on the server (missing TWILIO_MESSAGING_SERVICE_SID). ' +
        'Sending via a direct From number is disabled to avoid Twilio error 30034.',
    );
  }
  const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`;
  const form = new URLSearchParams();
  form.append('To', to);
  form.append('MessagingServiceSid', TWILIO_MESSAGING_SERVICE_SID);
  form.append('Body', body);
  if (STATUS_CALLBACK_URL) {
    form.append('StatusCallback', STATUS_CALLBACK_URL);
  }
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: form.toString(),
  });
  if (!resp.ok) throw new Error(`Twilio ${resp.status}: ${await resp.text()}`);
  return resp.json();
}

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    const tz = url.searchParams.get('tz');
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: rows, error: rpcError } = await admin.rpc('claim_and_notify_reminders', {
      p_tz: tz,
    });

    if (rpcError) throw new Error(rpcError.message);
    if (!Array.isArray(rows) || rows.length === 0) {
      return new Response(JSON.stringify({ ok: true, processed: 0 }), { status: 200 });
    }

    const results: Array<Record<string, unknown>> = [];

    for (const row of rows) {
      const receiptId = row.receipt_id as string;
      const milestone = row.milestone as number;
      const idempotencyKey = `${receiptId}:${milestone}`;
      const templateType =
        milestone === 3 ? 'PICKUP_REMINDER' : milestone === 5 ? 'URGENT_REMINDER' : 'DAY_30_REMINDER';

      const { data: receipt, error: recError } = await admin
        .from('receipt')
        .select(
          `id_order, public_id, order_number, deliver_date, client:fk_cliente ( name, phone_number )`,
        )
        .eq('id_order', receiptId)
        .maybeSingle();

      if (recError || !receipt) {
        console.error(`send-reminders: receipt not found for ${receiptId}`, recError);
        await markReminderNotificationResult(admin, idempotencyKey, {
          status: 'failed',
          errorCode: 'RECEIPT_NOT_FOUND',
          errorMessage: recError?.message ?? 'receipt not found',
        });
        results.push({ receiptId, milestone, status: 'failed', error: 'receipt not found' });
        continue;
      }

      const client = Array.isArray(receipt.client) ? receipt.client[0] : receipt.client;
      const phoneE164 = normalizeToE164(String(client?.phone_number ?? ''));
      if (!phoneE164 || !isValidE164(phoneE164)) {
        await markReminderNotificationResult(admin, idempotencyKey, {
          status: 'failed',
          errorCode: 'INVALID_PHONE',
          errorMessage: 'invalid phone',
        });
        results.push({ receiptId, milestone, status: 'skipped', error: 'invalid phone' });
        continue;
      }

      const { result: guardResult } = await runServerGuards(admin, phoneE164);
      if (!guardResult.ok) {
        console.error(`send-reminders: blocked for ${receiptId} milestone ${milestone}: ${guardResult.errorCode}`);
        await markReminderNotificationResult(admin, idempotencyKey, {
          status: 'failed',
          errorCode: guardResult.errorCode,
          errorMessage: guardResult.errorMessage,
        });
        results.push({ receiptId, milestone, status: 'blocked', error: guardResult.errorCode });
        continue;
      }

      const claim = await claimIdempotency(admin, {
        idempotency_key: idempotencyKey,
        order_id: receiptId,
        template_type: templateType,
        operator_id: null,
        phone: phoneE164,
      });
      if (!claim.ok) {
        results.push({ receiptId, milestone, status: 'duplicate' });
        continue;
      }

      const trackingUrl = PUBLIC_APP_URL
        ? `${PUBLIC_APP_URL}/tracking/${(receipt.public_id as string) || receiptId}`
        : `/tracking/${receiptId}`;

      const message = renderTemplate(templateType, {
        customerName: (client?.name as string) || 'Cliente',
        orderNumber: String(receipt.order_number ?? ''),
        trackingUrl,
        brandName: BRAND_NAME,
        storePhone: STORE_PHONE,
      });

      try {
        const twilio = await sendTwilioSms(phoneE164, message);
        await updateSmsSendSid(admin, idempotencyKey, twilio.sid);
        await markReminderNotificationResult(admin, idempotencyKey, { status: 'sent', messageSid: twilio.sid });
        results.push({ receiptId, milestone, status: 'sent', messageSid: twilio.sid });
      } catch (err) {
        console.error(`send-reminders: Twilio send failed for ${receiptId} milestone ${milestone}:`, err);
        await markSmsSendFailed(admin, idempotencyKey, { errorMessage: String(err) });
        await markReminderNotificationResult(admin, idempotencyKey, { status: 'failed', errorMessage: String(err) });
        results.push({ receiptId, milestone, status: 'failed', error: String(err) });
      }
    }

    return new Response(
      JSON.stringify({ ok: true, processed: results.length, results }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ ok: false, error: String(err) }), { status: 500 });
  }
});
