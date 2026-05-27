# Reminder Job runner (example)

This document describes the example runner `scripts/run_reminders.js` included in the repo.

Prerequisites
- A Postgres connection string with service privileges (Supabase service_role) in `DATABASE_URL`.
- Node.js installed (for this example script).

Quick run
```bash
DATABASE_URL="postgres://user:pass@host:5432/dbname" node scripts/run_reminders.js
# or with timezone (IANA):
DATABASE_URL="..." node scripts/run_reminders.js "America/Puerto_Rico"
```

What it does
- Calls the SQL function `public.get_due_receipt_reminders(p_tz)` to fetch receipts that are exactly on day 3/5/30 since `status_updated_at` and do not have a log entry yet.
- For each result, it prints a mock "sending" message and then calls `public.record_receipt_reminder(receipt_id, milestone)` to persist the log.

Next steps
- Replace the mock sending with a call to your backend Twilio service (server-side) and only call `record_receipt_reminder` after a confirmed send or delivery callback.
- Schedule this script with cron, a serverless schedule, or Supabase Edge Function.
