// Supabase Edge Function: send-reminder-sms
// Deploy with: supabase functions deploy send-reminder-sms
// Set secrets: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM

const TWILIO_ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID')!;
const TWILIO_AUTH_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN')!;
const TWILIO_FROM = Deno.env.get('TWILIO_FROM')!;

if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_FROM) {
  console.error('Missing Twilio env vars');
}

async function sendSms(to: string, body: string) {
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

Deno.serve(async (req) => {
  try {
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ ok: false, error: 'Method not allowed' }), {
        status: 405,
      });
    }

    const body = await req.json();
    const { taskId, phone, message } = body;

    if (!taskId || !phone || !message) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Missing required fields: taskId, phone, message' }),
        { status: 400 }
      );
    }

    // Send SMS
    const result = await sendSms(phone, message);

    return new Response(
      JSON.stringify({
        ok: true,
        taskId,
        messageSid: result.sid,
      }),
      { status: 200 }
    );
  } catch (err) {
    console.error('send-reminder-sms error:', err);
    return new Response(
      JSON.stringify({
        ok: false,
        error: String(err),
      }),
      { status: 500 }
    );
  }
});
