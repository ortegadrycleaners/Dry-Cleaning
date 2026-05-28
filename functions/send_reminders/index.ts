// Supabase Edge Function (Deno) example
// Deploy with `supabase functions deploy send-reminders` and set secrets:
// SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM

import { serve } from 'std/server';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const TWILIO_ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID')!;
const TWILIO_AUTH_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN')!;
const TWILIO_FROM = Deno.env.get('TWILIO_FROM')!;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing Supabase env vars');
}

if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_FROM) {
  console.warn('Twilio not fully configured; function will fail to send SMS');
}

async function rpcGetDue(tz: string | null) {
  const url = `${SUPABASE_URL}/rest/v1/rpc/get_due_receipt_reminders`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({ p_tz: tz }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`RPC failed: ${res.status} ${text}`);
  }
  return await res.json();
}

async function insertReminderLog(receiptId: string, milestone: number) {
  const url = `${SUPABASE_URL}/rest/v1/receipt_reminder_log`;
  const body = { receipt_id: receiptId, milestone };
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      Prefer: 'return=representation',
    },
    body: JSON.stringify(body),
  });
  // 201 created or 409 conflict
  if (res.status === 201) return res.json();
  if (res.status === 409) return null;
  const text = await res.text();
  throw new Error(`Insert reminder log failed: ${res.status} ${text}`);
}

async function insertNotification(payload: any) {
  const url = `${SUPABASE_URL}/rest/v1/receipt_notification`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      Prefer: 'return=representation',
    },
    body: JSON.stringify(payload),
  });
  if (res.status === 201) return res.json();
  if (res.status === 409) return null;
  const text = await res.text();
  throw new Error(`Insert notification failed: ${res.status} ${text}`);
}

async function sendSms(to: string, body: string) {
  // Use Twilio REST API via basic auth
  const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`;
  const form = new URLSearchParams();
  form.append('To', to);
  form.append('From', TWILIO_FROM);
  form.append('Body', body);

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: form.toString(),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Twilio error ${resp.status}: ${text}`);
  }
  return resp.json();
}

serve(async (req) => {
  try {
    const url = new URL(req.url);
    const tz = url.searchParams.get('tz') ?? null;

    // 1) Get due reminders (non-destructive)
    const due = await rpcGetDue(tz);
    if (!Array.isArray(due) || due.length === 0) {
      return new Response(JSON.stringify({ ok: true, processed: 0 }), { status: 200 });
    }

    const results: any[] = [];
    for (const row of due) {
      const receiptId = row.receipt_id;
      const milestone = row.milestone;

      // build message (simple template)
      const message = `Recordatorio: tu orden ${receiptId} lleva ${milestone} días lista. Por favor recógela.`;

      // Attempt to send SMS if phone available
      try {
        // Fetch recipient phone from receipt via REST (optional). For now we assume RPC provides it; otherwise query receipt table.
        // Send SMS
        await sendSms(row.phone ?? '', message);

        // On success insert reminder log and notification
        await insertReminderLog(receiptId, milestone);

        const notifPayload = {
          receipt_id: receiptId,
          notification_type: milestone === 3 ? 'PICKUP_REMINDER' : milestone === 5 ? 'URGENT_REMINDER' : 'DAY_30_REMINDER',
          milestone,
          message,
          phone: row.phone ?? null,
          customer_name: row.customer_name ?? null,
          order_number: row.order_number ?? null,
          idempotency_key: `${receiptId}:${milestone}`,
          metadata: { sent_via: 'twilio', sent_at: new Date().toISOString() },
        };
        await insertNotification(notifPayload);
        results.push({ receiptId, milestone, status: 'sent' });
      } catch (err) {
        console.error('Failed to process', receiptId, err);
        results.push({ receiptId, milestone, status: 'failed', error: String(err) });
      }
    }

    return new Response(JSON.stringify({ ok: true, processed: results.length, results }), { status: 200 });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ ok: false, error: String(err) }), { status: 500 });
  }
});
