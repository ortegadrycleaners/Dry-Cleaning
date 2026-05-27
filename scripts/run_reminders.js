#!/usr/bin/env node
// Example runner: query due reminders and record them after (mock) sending.
// Requirements: set DATABASE_URL env var (Postgres connection string with service role privileges).
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

      // TODO: replace this mock with real SMS sending logic (call your Twilio backend)
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
