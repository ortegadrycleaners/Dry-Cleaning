# Vulnerability: Tracking token generated but not validated

## Summary
Tracking links include a token, but the token is never validated. Access control only checks the orderId format. Combined with global order loading, a visitor can access order data without a valid token.

## Evidence
- Token is generated and appended to the URL:
  - NotificationService builds /tracking/:orderId?token=...
- TrackingGuard only validates the orderId format (UUID/Base62), not token.
- TrackingPage uses OrdersContext data (global orders list), not a token-scoped query.

## Impact
- Unauthorized access to order details if a tracking URL is shared or guessed.
- Exposure risk increases if OrdersContext loads all orders for any visitor.

## Likelihood
Medium to high in production if public tracking page is exposed.

## Affected Files
- src/services/NotificationService.ts
- src/components/TrackingGuard.tsx
- src/pages/TrackingPage.tsx
- src/context/OrdersContext.tsx

## Recommended Fixes
1. Validate token server-side (Edge Function/API) and only return the specific order.
2. Use public_id (or a dedicated tracking_id) and a token stored in DB with TTL.
3. Avoid loading all orders for the tracking page; query by public_id + token.

## Notes
A token in the URL without validation is equivalent to no token. Treat it as public.
