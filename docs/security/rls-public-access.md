# Vulnerability: Public RLS access on Client/Receipt

## Summary
Row Level Security policies allow public SELECT/INSERT/UPDATE on Client and Receipt. This exposes all customer and order data to anyone with the anon key (browser client), which is a critical data exposure risk.

## Evidence
- RLS is enabled and policies allow public access:
  - client_public_select: USING (true)
  - client_public_insert: WITH CHECK (true)
  - receipt_public_select: USING (true)
  - receipt_public_insert: WITH CHECK (true)
  - receipt_public_update: USING (true) WITH CHECK (true)

## Impact
- Any unauthenticated user can read all customers and orders.
- Any unauthenticated user can create or update orders, including status changes.
- Privacy and data integrity risk (PII exposure, order tampering).

## Likelihood
High in production because the Supabase anon key is used from the browser.

## Affected Files
- docs/supabase_migration.sql
- src/services/supabase/ordersService.ts
- src/services/supabase/customersService.ts
- src/services/supabase/customerSource.ts
- src/lib/supabase.ts

## Recommended Fixes
1. Restrict RLS policies:
   - Remove public SELECT/UPDATE policies.
   - Require authenticated users or specific role claims for writes.
2. Move write operations to a server-side layer (Edge Function/API) with service role.
3. For tracking, expose only safe public data via a dedicated view or function.

## Notes
If the Data API is exposed to anon/authenticated roles, these policies make all rows reachable. Tighten both grants and RLS.
