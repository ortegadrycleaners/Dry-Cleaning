/**
 * Edge Function unificada: recordatorios (modal) + notificaciones de orden (dashboard).
 * Deploy: supabase functions deploy send-reminder-sms
 * Secrets: TWILIO_*, SUPABASE_* (auto), SMS_KILL_SWITCH, SMS_DAILY_BUDGET, SMS_GLOBAL_PER_MINUTE, SMS_ALLOWLIST, PUBLIC_APP_URL
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { renderTemplate, type TemplateType } from '../_shared/messageTemplates.ts';
import {
  claimIdempotency,
  runServerGuards,
  updateSmsSendSid,
  type GuardFail,
} from '../_shared/guards.ts';
import { isValidE164, normalizeToE164 } from '../_shared/phoneValidation.ts';

const TWILIO_ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID') ?? '';
const TWILIO_AUTH_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN') ?? '';
const TWILIO_FROM = Deno.env.get('TWILIO_FROM') ?? Deno.env.get('TWILIO_FROM_NUMBER') ?? '';
const TWILIO_MESSAGING_SERVICE_SID = Deno.env.get('TWILIO_MESSAGING_SERVICE_SID') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const PUBLIC_APP_URL = (Deno.env.get('PUBLIC_APP_URL') ?? '').replace(/\/$/, '');
const BRAND_NAME = Deno.env.get('BRAND_NAME') ?? 'Ortega Dry Cleaners';
const STORE_PHONE = Deno.env.get('STORE_PHONE') ?? '(904) 666-0809';
const REVIEW_URL =
  Deno.env.get('REVIEW_URL') ??
  'https://www.google.com/search?q=Ortega+Dry+Cleaners+San+Juan+PR';

const TEMPLATE_TYPES: TemplateType[] = [
  'ORDER_CREATED',
  'ORDER_RECEIVED_TRACKING',
  'ORDER_DELAYED',
  'THANK_YOU_REVIEW',
  'ORDER_READY',
  'PICKUP_REMINDER',
  'URGENT_REMINDER',
  'DAY_30_REMINDER',
];

type JsonResponse = Record<string, unknown>;

function json(body: JsonResponse, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function guardResponse(fail: GuardFail): Response {
  return json({ ok: false, errorCode: fail.errorCode, errorMessage: fail.errorMessage }, 429);
}

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

function getBearerToken(req: Request): string | null {
  const auth = req.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) return null;
  return auth.slice(7).trim() || null;
}

async function requireAuthUser(req: Request) {
  const token = getBearerToken(req);
  if (!token) {
    return { error: json({ ok: false, errorCode: 'UNAUTHENTICATED', errorMessage: 'Missing Authorization' }, 401) };
  }
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: { user }, error } = await userClient.auth.getUser(token);
  if (error || !user) {
    return { error: json({ ok: false, errorCode: 'UNAUTHENTICATED', errorMessage: 'Invalid session' }, 401) };
  }
  return { user, token };
}

function adminClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

function formatPhoneFromDb(raw: string | number | null | undefined): string | null {
  if (raw == null) return null;
  return normalizeToE164(String(raw));
}

function buildTrackingUrl(publicId: string | null, orderId: string, origin?: string): string {
  const base = PUBLIC_APP_URL || origin || '';
  const token = (publicId?.trim() || orderId).trim();
  return base ? `${base}/tracking/${token}` : `/tracking/${token}`;
}

function formatEstimatedDate(deliverDate: string | null | undefined): { estimatedDate: string; estimatedDay?: string } {
  if (!deliverDate) return { estimatedDate: 'TBD' };
  const parsed = new Date(deliverDate);
  if (Number.isNaN(parsed.getTime())) return { estimatedDate: 'TBD' };
  return {
    estimatedDate: parsed.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' }),
    estimatedDay: parsed.toLocaleDateString('en-US', { weekday: 'long' }),
  };
}

async function handleReminderFlow(
  req: Request,
  body: { taskId?: string; phone?: string; message?: string },
) {
  const auth = await requireAuthUser(req);
  if ('error' in auth && auth.error) return auth.error;

  const { taskId, phone, message } = body;
  if (!taskId || !phone || !message) {
    return json({ ok: false, error: 'Missing required fields: taskId, phone, message' }, 400);
  }

  const phoneE164 = normalizeToE164(phone);
  if (!phoneE164 || !isValidE164(phoneE164)) {
    return json({ ok: false, errorCode: 'INVALID_PHONE', errorMessage: 'Invalid phone format' }, 400);
  }

  const admin = adminClient();

  const { data: task, error: taskError } = await admin
    .from('receipt_reminder_task')
    .select('id, receipt_id, status')
    .eq('id', taskId)
    .maybeSingle();

  if (taskError || !task) {
    return json({ ok: false, error: 'Reminder task not found' }, 404);
  }
  if (task.status !== 'pending') {
    return json({ ok: false, errorCode: 'FORBIDDEN', errorMessage: 'Task is not pending' }, 400);
  }

  const { result: guardResult } = await runServerGuards(admin, phone);
  if (!guardResult.ok) return guardResponse(guardResult);

  const idempotencyKey = `reminder:${taskId}`;
  const claim = await claimIdempotency(admin, {
    idempotency_key: idempotencyKey,
    order_id: task.receipt_id as string,
    template_type: 'REMINDER_TASK',
    operator_id: auth.user!.id,
    phone: phoneE164,
  });
  if (!claim.ok) return guardResponse(claim);

  try {
    const twilioResult = await sendTwilioSms(phoneE164, message);
    await updateSmsSendSid(admin, idempotencyKey, twilioResult.sid);

    const { error: updateError } = await admin
      .from('receipt_reminder_task')
      .update({ status: 'sent', sent_at: new Date().toISOString() })
      .eq('id', taskId);

    if (updateError) {
      console.error('Task update failed after SMS sent:', updateError);
    }

    return json({ ok: true, taskId, messageSid: twilioResult.sid });
  } catch (err) {
    await admin
      .from('receipt_reminder_task')
      .update({ status: 'failed', attempted_at: new Date().toISOString() })
      .eq('id', taskId);
    console.error('reminder SMS error:', err);
    return json({ ok: false, error: String(err) }, 500);
  }
}

async function handleOrderNotifyFlow(
  req: Request,
  body: {
    orderId?: string;
    templateType?: string;
    idempotencyKey?: string;
    operatorId?: string;
  },
  origin: string | undefined,
) {
  const auth = await requireAuthUser(req);
  if ('error' in auth && auth.error) return auth.error;

  const { orderId, templateType, idempotencyKey, operatorId } = body;
  if (!orderId || !templateType || !idempotencyKey) {
    return json(
      { ok: false, error: 'Missing required fields: orderId, templateType, idempotencyKey' },
      400,
    );
  }

  if (!TEMPLATE_TYPES.includes(templateType as TemplateType)) {
    return json({ ok: false, errorCode: 'FORBIDDEN', errorMessage: 'Unknown template type' }, 400);
  }

  const type = templateType as TemplateType;
  const admin = adminClient();

  const { data: row, error: fetchError } = await admin
    .from('receipt')
    .select(
      `
      id_order,
      public_id,
      order_number,
      status,
      rack_number,
      deliver_date,
      status_updated_at,
      client:fk_cliente ( name, phone_number )
    `,
    )
    .eq('id_order', orderId)
    .maybeSingle();

  if (fetchError || !row) {
    return json({ ok: false, errorCode: 'FORBIDDEN', errorMessage: 'Order not found' }, 404);
  }

  const client = Array.isArray(row.client) ? row.client[0] : row.client;
  const customerName = (client?.name as string | undefined)?.trim() || 'Cliente';
  const phoneRaw = client?.phone_number;
  const phoneE164 = formatPhoneFromDb(phoneRaw as string | number | null);
  if (!phoneE164) {
    return json({ ok: false, errorCode: 'INVALID_PHONE', errorMessage: 'No valid phone on file' }, 400);
  }

  if (type === 'ORDER_READY') {
    if (row.status !== 'LISTO') {
      return json({
        ok: false,
        errorCode: 'INVALID_ORDER_STATE',
        errorMessage: `Order is not LISTO (current: ${row.status})`,
      }, 400);
    }
    if (!row.rack_number?.trim()) {
      return json({
        ok: false,
        errorCode: 'INVALID_ORDER_STATE',
        errorMessage: 'Rack number required for LISTO orders',
      }, 400);
    }
  }

  if (type === 'PICKUP_REMINDER' || type === 'URGENT_REMINDER' || type === 'DAY_30_REMINDER') {
    if (row.status !== 'LISTO') {
      return json({
        ok: false,
        errorCode: 'INVALID_ORDER_STATE',
        errorMessage: `Order is not LISTO (current: ${row.status})`,
      }, 400);
    }
  }

  const { result: guardResult } = await runServerGuards(admin, phoneE164);
  if (!guardResult.ok) return guardResponse(guardResult);

  const claim = await claimIdempotency(admin, {
    idempotency_key: idempotencyKey,
    order_id: orderId,
    template_type: type,
    operator_id: operatorId ?? auth.user!.id,
    phone: phoneE164,
  });
  if (!claim.ok) return guardResponse(claim);

  const { estimatedDate, estimatedDay } = formatEstimatedDate(row.deliver_date as string | null);
  const trackingUrl = buildTrackingUrl(row.public_id as string | null, orderId, origin);
  const renderedMessage = renderTemplate(type, {
    customerName,
    orderNumber: String(row.order_number ?? ''),
    trackingUrl,
    rackNumber: row.rack_number as string | undefined,
    estimatedDate,
    estimatedDay,
    brandName: BRAND_NAME,
    storePhone: STORE_PHONE,
    reviewUrl: REVIEW_URL,
  });

  try {
    const twilioResult = await sendTwilioSms(phoneE164, renderedMessage);
    await updateSmsSendSid(admin, idempotencyKey, twilioResult.sid);
    return json({
      ok: true,
      messageSid: twilioResult.sid,
      renderedMessage,
      status: 'queued',
    });
  } catch (err) {
    console.error('order_notify SMS error:', err);
    return json({
      ok: false,
      errorCode: 'TWILIO_API_ERROR',
      errorMessage: String(err),
    }, 500);
  }
}

Deno.serve(async (req) => {
  try {
    if (req.method !== 'POST') {
      return json({ ok: false, error: 'Method not allowed' }, 405);
    }

    const origin = req.headers.get('Origin') ?? undefined;
    const body = await req.json();
    const flow = body.flow as string | undefined;

    if (flow === 'reminder' || (body.taskId && body.phone && body.message && !body.orderId)) {
      return handleReminderFlow(req, body);
    }

    if (flow === 'order_notify' || body.orderId) {
      return handleOrderNotifyFlow(req, body, origin);
    }

    return json({ ok: false, error: 'Unknown flow; use flow=reminder or flow=order_notify' }, 400);
  } catch (err) {
    console.error('send-reminder-sms error:', err);
    return json({ ok: false, error: String(err) }, 500);
  }
});
