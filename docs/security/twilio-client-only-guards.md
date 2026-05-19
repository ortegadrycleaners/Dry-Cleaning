# Vulnerability: Twilio protections are client-side only

## Summary
Twilio SMS protections (rate limits, allowlist, kill switch) run in the browser. If the backend endpoint does not enforce the same checks, an attacker can bypass the UI and send SMS at cost.

## Evidence
- runAllGuards executes only in frontend before calling the backend endpoint.
- Endpoint key is optional and stored in VITE_ env (public in bundle).
- No server-side enforcement is shown in this repo.

## Impact
- SMS abuse, unexpected costs, and spam risk.
- Repeated sends despite client-side dedup if backend lacks idempotency checks.

## Likelihood
Medium if endpoint is exposed without auth/rate limits.

## Affected Files
- src/services/twilio/TwilioService.ts
- src/services/twilio/protections.ts
- src/services/twilio/config.ts
- docs/TWILIO_SETUP.md

## Recommended Fixes
1. Enforce auth and rate limits on the backend endpoint.
2. Validate idempotency keys server-side and store send history.
3. Reject requests that fail order state or allowlist checks server-side.

## Notes
Client-side guards are useful for UX but never security boundaries.
