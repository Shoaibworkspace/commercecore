# Testing and verification

Run commands from the repository root with Node.js 24:

```sh
npm ci
npm run check
npm run format:check
npm run repo:check
npm audit --audit-level=high
```

The main check runs TypeScript, zero-warning ESLint, Node unit/integration tests, the frontend build, gzip/photo budgets and a Worker dry-run. Databases created by tests are isolated local D1 instances. No test needs production config, a real SMTP key or a payment gateway.

## Coverage

| Area                                                                                                      | Test files                                                               |
| --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Health, unavailable DB and safe API errors                                                                | `api.test.mjs`                                                           |
| Local passwords, login, session rotation/expiry, CSRF, ownership and roles                                | `auth.test.mjs`                                                          |
| Supabase identity mapping, confirmed users, redirects, fail-closed errors and recovery session revocation | `supabase-auth.test.mjs`                                                 |
| Cart quantities, stock limits, persistence and competing writes                                           | `cart.test.mjs`                                                          |
| Wishlist ownership and atomic transfer                                                                    | `wishlist.test.mjs`                                                      |
| Catalog filters, literal searches, pagination, image references and sale prices                           | `catalog.test.mjs`, `catalog-api.test.mjs`, `catalog-expansion.test.mjs` |
| Quote expiry/ownership, server totals, idempotency, last-unit races and rollback                          | `checkout.test.mjs`                                                      |
| Admin authorization, audited edits, stock adjustments, order states and cancellation races                | `admin.test.mjs`                                                         |
| Rate budgets, request limits, schema/index and transaction invariants                                     | `hardening.test.mjs`, `schema.test.mjs`, `d1.test.mjs`                   |
| Cache invalidation scope                                                                                  | `frontend-cache.test.mjs`                                                |
| Deployment config and safe source-upload candidates                                                       | `deployment.test.mjs`, `repository.test.mjs`                             |

## Browser review

Review the homepage, category sorting/filtering, variant/size selection, cart/wishlist, account forms, recovery guidance and admin navigation at narrow and wide sizes. Check light/dark contrast, keyboard focus, Escape behavior and reduced-motion preferences. Visual checks are separate from API tests.

The reference deployment has verified email confirmation, sign-in and explicitly authorized admin access. A live add/remove check of the sliding bag restored only the test item. Existing customer data and orders were preserved.

Password recovery is integrated and covered with an isolated provider mock. A real recovery email/new-password/sign-in test still needs the user to enter private credentials; do not claim that step is live-tested until it is completed.

## Reports

Sanitized evidence is kept together in `docs/reports/`:

- `dependency-audit.json`: known npm advisories at the recorded review.
- `performance-assets.json`: build/photo bytes against explicit budgets.
- `api-benchmark.json`: local API measurements with dataset/runtime/concurrency context.
- `auth-benchmark.json`: local password work-factor timing.
- `hosted-verification.json`: read-only public catalog and auth-boundary checks.

Generate fresh reports when behavior/dependencies change. Local benchmarks are not hosting-capacity or uptime guarantees. Anonymous live probes do not exercise private recovery, authenticated checkout or admin mutations.

## Repository checks

The upload guard scans Git candidates for known credential signatures, private/runtime paths, oversized files and broken local documentation links. It never prints matched credential values and is not a complete secret-detection tool.

After moving source files, stage the intended renames before running candidate checks so Git's index reflects the actual tree. Keep production bindings, local databases, generated masters and private screenshots ignored.

## Baseline and refactor acceptance

The review before the folder reorganization passed 197 tests, type/lint/build/format checks, Worker dry-run, zero known npm vulnerabilities and eight anonymous hosted checks. A clean source install/build plus six focused deployment/auth/runtime checks also passed without private production config.

The reorganized source passed all 197 tests again, TypeScript, zero-warning ESLint, production build, asset budgets, Worker dry-run, formatting and the repository upload guard. The dependency audit reported zero known vulnerabilities. The refactor changes organization and documentation; database contents, payment mode and public API contracts are preserved.
