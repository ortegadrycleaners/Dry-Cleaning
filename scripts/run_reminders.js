#!/usr/bin/env node
// Legacy CLI: claims due reminders in Postgres only (no Twilio).
// Prefer: supabase functions deploy send-reminders && invoke the Edge Function,
// or the dashboard modal + send-reminder-sms (flow=reminder).
// Usage: DATABASE_URL="postgres://..." node scripts/run_reminders.js [TIMEZONE]

const { Client } = require('pg');

async function main() {
  const conn = process.env.DATABASE_URL;
  if (!conn) {
    console.error('Please set DATABASE_URL with a service-role Postgres connection string');
    process.exit(1);
  }

  const tz = process.argv[2] || null; // optional IANA timezone
  const client = new Client({ connectionString: conn });
  await client.connect();

  try {
    const res = await client.query('SELECT * FROM public.claim_due_receipt_reminders($1)', [tz]);
    if (!res.rows.length) {
      console.log('No reminders due today.');
      return;
    }

    for (const row of res.rows) {
      const receiptId = row.receipt_id;
      const milestone = row.milestone;

      // Log only; use Edge Function send-reminders for real SMS.
      console.log(`Sending reminder milestone=${milestone} for receipt=${receiptId}`);

      // Simulate success and record in DB (idempotent)
      await client.query('SELECT public.record_receipt_reminder($1, $2)', [receiptId, milestone]);
      console.log(`Recorded reminder for ${receiptId} milestone ${milestone}`);
    }
  } finally {
    await client.end();
  }
}

main().catch(err => { console.error(err); process.exit(1); });
