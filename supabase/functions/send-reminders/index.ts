/**
 * Batch reminder runner: claims due reminders and sends SMS via Twilio.
 * Deploy: supabase functions deploy send-reminders --no-verify-jwt
 * Invoke: POST with ?tz=America/Puerto_Rico (optional)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { renderTemplate } from '../_shared/messageTemplates.ts';
import { runServerGuards, claimIdempotency, updateSmsSendSid } from '../_shared/guards.ts';
import { normalizeToE164, isValidE164 } from '../_shared/phoneValidation.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const TWILIO_ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID') ?? '';
const TWILIO_AUTH_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN') ?? '';
const TWILIO_FROM = Deno.env.get('TWILIO_FROM') ?? Deno.env.get('TWILIO_FROM_NUMBER') ?? '';
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
  if (!TWILIO_MESSAGING_SERVICE_SID && !TWILIO_FROM) {
    throw new Error('Twilio is not configured on the server (need TWILIO_MESSAGING_SERVICE_SID or TWILIO_FROM)');
  }
  const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`;
  const form = new URLSearchParams();
  form.append('To', to);
  // Prefer Messaging Service SID over direct From number
  if (TWILIO_MESSAGING_SERVICE_SID) {
    form.append('MessagingServiceSid', TWILIO_MESSAGING_SERVICE_SID);
  } else {
    form.append('From', TWILIO_FROM);
  }
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
        results.push({ receiptId, milestone, status: 'failed', error: 'receipt not found' });
        continue;
      }

      const client = Array.isArray(receipt.client) ? receipt.client[0] : receipt.client;
      const phoneE164 = normalizeToE164(String(client?.phone_number ?? ''));
      if (!phoneE164 || !isValidE164(phoneE164)) {
        results.push({ receiptId, milestone, status: 'skipped', error: 'invalid phone' });
        continue;
      }

      const { result: guardResult } = await runServerGuards(admin, phoneE164);
      if (!guardResult.ok) {
        results.push({ receiptId, milestone, status: 'blocked', error: guardResult.errorCode });
        continue;
      }

      const idempotencyKey = `${receiptId}:${milestone}`;
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
        results.push({ receiptId, milestone, status: 'sent', messageSid: twilio.sid });
      } catch (err) {
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
