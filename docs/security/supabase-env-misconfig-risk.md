# Risk: Supabase client created with empty env values

## Summary
The Supabase client is created even when VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY are missing. This can mask misconfiguration and cause unexpected runtime behavior.

## Evidence
- The code logs an error but still calls createClient with empty strings.

## Impact
- Hard-to-diagnose runtime failures and partial feature breakage.
- Not a direct security breach, but can hide configuration mistakes.

## Likelihood
Medium in new environments or staging.

## Affected Files
- src/lib/supabase.ts

## Recommended Fixes
1. Fail fast when env vars are missing (throw or return a disabled client).
2. Add a startup check that blocks features when Supabase is not configured.

## Notes
This is a configuration risk, not a data exposure by itself.
