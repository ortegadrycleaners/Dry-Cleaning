# Risk: Supabase client created with empty env values

## Status
✅ **RESOLVED** - Implemented fail-fast validation in `src/lib/supabase.ts`

## Summary
The Supabase client is created even when VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY are missing. This can mask misconfiguration and cause unexpected runtime behavior.

**Update**: Now throws an error immediately if env vars are missing, preventing silent failures.

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
✅ **IMPLEMENTED**: 
- `src/lib/supabase.ts` now throws an error if env vars are missing during module initialization
- Removed fallbacks to empty strings (`|| ''`)
- Message clearly indicates what needs to be configured

## Resolution Details
Changed from:
```typescript
if (!supabaseUrl || !supabaseKey) {
  console.error(...); // Logged but continued
}
export const supabase = createClient(supabaseUrl || '', supabaseKey || ''); // Still runs with empty strings
```

To:
```typescript
if (!supabaseUrl || !supabaseKey) {
  throw new Error('[Supabase] FATAL: ...');
}
export const supabase = createClient(supabaseUrl, supabaseKey); // Guaranteed to have valid values
```

## Notes
This is a configuration risk, not a data exposure by itself.
