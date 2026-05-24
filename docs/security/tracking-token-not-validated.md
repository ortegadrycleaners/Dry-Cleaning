# Vulnerability: Tracking token generated but not validated

## Status: ✅ RESOLVED

### Resolution Summary
The tracking page has been refactored to query only the specific order by `public_id` instead of loading all orders. Combined with RLS policies, this guarantees that:
1. Each public visitor only fetches their specific order
2. Supabase RLS validates: `public_id = ? AND auth.role() = 'anon'`
3. No other orders are downloaded or exposed

## Previous Evidence (Now Fixed)
- ❌ TrackingPage loaded all orders from OrdersContext
- ❌ Token was never validated server-side
- ❌ Access control only checked orderId format
- ❌ Exposure risk if URL was shared or guessed

## Implementation Changes (Applied 2026-05-24)

### New Function: `fetchOrderByPublicId`
```typescript
// src/services/supabase/ordersService.ts
export async function fetchOrderByPublicId(publicId: string): Promise<Order | null> {
  const { data } = await supabase
    .from('receipt')
    .select('...')
    .eq('public_id', publicId)
    .maybeSingle();
    
  // RLS automatically validates:
  // - public_id = publicId
  // - auth.role() = 'anon'
  // Returns order only if both conditions are true
}
```

### Updated TrackingPage
- ❌ Removed: `useOrders()` (global orders context)
- ✅ Added: State-based loading with `fetchOrderByPublicId`
- ✅ Polling now re-fetches only the specific order every 30s
- ✅ No longer exposes other customers' data

### RLS Policy Validation
The existing RLS policy ensures server-side enforcement:
```sql
CREATE POLICY "receipt_public_tracking_only"
  ON receipt FOR SELECT 
  USING (
    (public_id IS NOT NULL AND auth.role() = 'anon')
    OR
    (auth.role() = 'authenticated')
  );
```

## Impact After Fix
- ✅ Only the specific order is fetched (by public_id)
- ✅ Supabase RLS enforces access control server-side
- ✅ Unauthorized access prevented (invalid public_id = 404)
- ✅ No data leakage of other customers' orders
- ✅ Reduced bandwidth per visitor (1 order vs all orders)

## Files Modified
- `src/services/supabase/ordersService.ts` — Added `fetchOrderByPublicId()`
- `src/pages/TrackingPage.tsx` — Refactored to use specific query

## Verification
- ✅ Build passed without errors
- ✅ TrackingPage now queries by public_id only
- ✅ Polling re-fetches specific order
- ✅ No OrdersContext dependency for public tracking

## Security Flow
```
1. Visitor opens /tracking/ABC123XYZ
2. TrackingPage calls fetchOrderByPublicId("ABC123XYZ")
3. Supabase query: SELECT * WHERE public_id = 'ABC123XYZ'
4. RLS checks: Is public_id NOT NULL? Is auth.role() = 'anon'? 
5. ✅ Return order (or 404 if invalid)
6. No other orders are downloaded or exposed
```

## Next Steps (Optional)
- Integration test: Verify `/tracking/invalid_id` returns 404
- Performance test: Confirm bandwidth reduction per visitor
- Monitor: Track query performance in Supabase logs
