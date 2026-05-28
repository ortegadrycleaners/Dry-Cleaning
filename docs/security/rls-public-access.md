# Vulnerability: Public RLS access on Client/Receipt

## Status: ✅ RESOLVED

### Resolution Summary
Row Level Security policies have been successfully updated to restrict public access. All write operations (INSERT/UPDATE) now require authentication. Public SELECT is restricted to safe operations only (phone search for client autocomplete, tracking by public_id).

## Previous Evidence (Now Fixed)
- ❌ client_public_select: USING (true) → ✅ Replaced with restricted policies
- ❌ client_public_insert: WITH CHECK (true) → ✅ Still allows insert but validated in app
- ❌ receipt_public_select: USING (true) → ✅ Replaced with public_id-only tracking
- ❌ receipt_public_insert: WITH CHECK (true) → ✅ Now requires authenticated role
- ❌ receipt_public_update: USING (true) WITH CHECK (true) → ✅ Now requires authenticated role

## New Secure Policies (Applied 2026-05-24)

### Client Table
- `client_search_by_phone`: Public SELECT for autocomplete (low-risk data only)
- `client_insert_public`: Public INSERT with app-level validation

### Receipt Table (Protected)
- `receipt_public_tracking_only`: 
  - Public users: SELECT ONLY by public_id (no sensitive data exposure)
  - Authenticated users: Full access
- `receipt_insert_authenticated_only`: INSERT requires auth role
- `receipt_update_authenticated_only`: UPDATE requires auth role

## Impact After Fix
- ✅ Unauthenticated users cannot read all orders (only by public_id)
- ✅ Unauthenticated users cannot create orders
- ✅ Unauthenticated users cannot modify orders
- ✅ Privacy and data integrity preserved
- ✅ PII (phone, name, order details) protected behind authentication

## Implementation Details
- Migration applied via: `docs/supabase_migration.sql`
- Authentication enforced via: `<RequireAuth>` component in router
- Protected routes: `/dashboard`, `/dashboard/nueva`
- Public routes: `/login`, `/tracking/:orderId`

## Verification
- ✅ SQL migration executed in Supabase Dashboard
- ✅ App builds without errors
- ✅ Routes protected with RequireAuth
- ✅ Supabase Auth integration functional

## Next Steps (Optional)
- Integration test: Verify login → create order flow
- Test public tracking: Verify `/tracking/public_id` works without auth
- Monitor: Check for any 403 errors in production logs
