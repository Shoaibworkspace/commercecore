# Phase 4 — Local authentication and accounts

Implemented registration/login/logout, opaque HttpOnly sessions, profile and saved Indian demo addresses, protected account APIs, CSRF/origin validation, shared rate limits and database-role authorization. Existing catalog/photo design and welcome screen remain intact. Production account access is deliberately disabled pending actual Workers Free CPU verification.

## Files created or changed

- Contracts/data: `shared/account.ts`, `db/migrations/0003_accounts.sql`.
- Backend: `worker/services/auth.ts`, `crypto.ts`, `worker/middleware/auth.ts`, `worker/validators/json.ts`, `worker/repositories/account.ts`, `worker/routes/account.ts`, app/types/errors/health wiring.
- Frontend: `src/features/account/query.ts`, `src/pages/Auth.tsx`, `Account.tsx`, `src/styles/account.css`, main routes, Layout and implementation-status copy.
- Tooling: Node crypto compatibility/types, package/lock, `scripts/setup-local-auth.mjs`, `benchmark-auth.mjs`, `.dev.vars.example`, ignored generated local secret.
- Verification/docs: `tests/auth.test.mjs`, health status assertion, `docs/accounts.md`, `docs/auth-benchmark.json`, API/security/deployment/frontend/README updates and this report.

## Run and verify

```sh
npm ci
npm run db:migrate:local
npm run db:seed:local
npm run auth:setup:local
npm run check
npm run dev
```

Optional local timing evidence: `npm run auth:benchmark`. Visit `/register`, `/login`, `/account`. Use disposable sample details. Setup never prints the generated secret. No Cloudflare account is required locally.

## Verification

Verified locally on **15 October 2026**:

- `npm run check` passed: **69 tests, zero failures/skips**, frontend/Worker type checks, zero-warning lint, production frontend build and Worker deployment dry run. The new auth suite accounts for 28 results (26 integration cases, enclosing test and password unit test).
- `npm run format:check` passed. Wrangler applied all six statements in the additive account migration. Local secret setup generated an ignored random secret without printing it; no real administrator was provisioned.
- Tests cover strong work factors and randomized salts, valid/invalid login, email normalization, no customer role escalation, token hashing/rotation/revocation, session/idle/device caps, secret rotation, pre-auth and session CSRF, exact origin, streamed JSON/MIME limits, shared IP/account registration/login quotas and Retry-After, denial before account-key growth, ownership, stale profile/address writes, concurrent defaults/address caps and transaction rollback under injected session-insert failure.
- Local native-workerd password derivation ran at 600,000 iterations; Node/local Worker wall-time samples and hardware are recorded in `docs/auth-benchmark.json`. No live cloud CPU or concurrency capacity is claimed.
- Browser signup created a disposable `.example.test` account on the actual local Worker. The header became My account; profile and address creation/editing persisted through reload. The initial saved address became default. Logout returned to login. Wrong-password feedback was generic and the password field cleared; correct login restored the saved profile/address. Show/hide changed the password input type and was reset before screenshots.
- Signed-out `/account` redirected to `/login`. Account layout was inspected at desktop/390 px/320 px; login at 320 px. DOM scroll width equaled client width. No captured browser warnings/errors remained. Temporary viewport overrides were reset and the test account was signed out.
- A medium-screen sign-in-link visibility issue found during responsive review was corrected with a CSS override and the frontend rebuilt. At 800 px the sign-in link was visible and scroll width equaled client width. No business logic changed after the full test run.
- Screenshots: `docs/phase-4-register.png`, `docs/phase-4-account.png`, `docs/phase-4-account-details.png` and `docs/phase-4-mobile.png`. The saved profile/address use explicitly fictional sample details. Address deletion is verified in isolated API tests; no user-owned record was removed during browser QA.

Measured final frontend artifacts: main JS 348.28 kB / 105.78 kB gzip, separate shared chunk 49.33 kB / 17.49 kB gzip, Account route 9.69 kB / 2.90 kB gzip, Auth route 4.18 kB / 1.85 kB gzip, CSS 52.14 kB / 11.41 kB gzip. Worker dry-run bundle 866.65 KiB / 144.71 KiB gzip. These are artifact sizes, not Free-plan CPU/throughput evidence.

Native TextDecoder constructor typing and a lint rule for a deliberate control-character rejection were corrected before final checks. The rollback-injection test intentionally logs one sanitized `request_failed` event with request ID, while verifying that provider errors and partial users are not exposed/persisted.

## Known limitations

This is a local functional delivery, not a verified public Free-plan authentication release. Strong hash work factors are unchanged; local wall times do not prove the 10 ms cloud CPU budget can accommodate them. Public auth fails closed until deliberately configured after actual trace verification. See `docs/accounts.md` for the release criteria and alternative-provider decision if the budget cannot fit secure native hashing.

No email verification/recovery/change, password change, MFA, self-service account deletion, administrator UI/provisioning or public admin catalog mutation was introduced. Indian addresses only; sample data remains in local D1. No real payment/fulfillment, live deploy or GitHub publication was performed. Automated tests are real local D1 tests; browser QA is manual.

**Next phase: Phase 5 — Persistent cart and wishlist**, using authenticated ownership, valid active variants and server-calculated prices. Cloud authentication release verification remains mandatory before Phase 9 public enablement.
