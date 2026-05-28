# Twilio protections — server-side enforcement

## Status: RESOLVED (code)

SMS rate limits, idempotency, allowlist, and kill switch are enforced in the unified Edge Function `send-reminder-sms` and batch runner `send-reminders`.

## Server implementation

- **Auth:** `order_notify` and `reminder` flows require a valid Supabase JWT (`Authorization: Bearer`).
- **Idempotency:** `sms_sends` table (`docs/sms_sends_migration.sql`) with `ON CONFLICT` → `DUPLICATE`.
- **Guards:** `supabase/functions/_shared/guards.ts` — kill switch, daily budget, global per-minute, allowlist, E.164 validation.
- **Canonical data:** Phone and order state loaded from Postgres with service role; client payload is not trusted for phone numbers on `order_notify`.

## Client role

Frontend guards in `src/services/twilio/protections.ts` remain for UX (fast feedback). They are not a security boundary.

## Secrets (Supabase Edge Functions)

| Secret | Purpose |
|--------|---------|
| `SMS_KILL_SWITCH` | Block all sends when `true` |
| `SMS_DAILY_BUDGET` | Max sends per UTC day |
| `SMS_GLOBAL_PER_MINUTE` | Max sends per rolling minute |
| `SMS_ALLOWLIST` | Optional CSV E.164 for QA |

## Affected files

- `supabase/functions/send-reminder-sms/index.ts`
- `supabase/functions/send-reminders/index.ts`
- `supabase/functions/_shared/guards.ts`
- `docs/sms_sends_migration.sql`
- `src/services/twilio/TwilioService.ts`
