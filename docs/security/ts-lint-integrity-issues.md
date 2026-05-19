# Integrity: Lint/React rules failing (not a security issue)

## Summary
TypeScript build passes, but ESLint reports multiple React integrity rule violations and one explicit any. These are not direct vulnerabilities, but indicate potential regressions or unstable behavior.

## Evidence
- ESLint failures in:
  - src/context/OrdersContext.tsx (setState in effect)
  - src/hooks/use-mobile.ts (setState in effect)
  - src/context/AuthContext.tsx (react-refresh export rule)
  - src/context/NotificationsContext.tsx (react-refresh export rule)
  - src/i18n.tsx (react-refresh export rule, empty block)
  - src/pages/NewOrderPage.tsx (explicit any)

## Impact
- Potential runtime inconsistencies or degraded developer experience.

## Likelihood
High in dev; not a direct security impact.

## Recommended Fixes
1. Move non-component exports out of React component files for react-refresh.
2. Refactor useEffect state updates to avoid setState directly in effect bodies.
3. Remove explicit any from NewOrderPage.

## Notes
Keep lint passing to catch real regressions early.
