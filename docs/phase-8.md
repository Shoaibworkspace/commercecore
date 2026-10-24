# Phase 8 — Security, testing and performance

Local hardening is implemented. No deployment, payment, account-provider or verification-email service was introduced. The previously selected administrator retains access.

## Changes

- Shared D1 mutation budgets after authentication/role/CSRF. Limits are account-scoped, pseudonymous HMAC keys; changing URLs, clients or idempotency keys cannot multiply a bucket. Counter increments are atomic, saturate and expire. Blocked requests return 429/Retry-After before business mutations. Counter failures return 503 and fail closed; GET/HEAD remain usable. Expired housekeeping deletes at most 20 counter rows per request.
- Required-write checks now cover checkout order/key/audit inserts as well as existing inventory/cart triggers. Silent key/audit skips roll back orders, snapshots, all stock/ledger changes and cart clearing. Address target/default writes also roll back together when silently skipped.
- API permissions/CORP headers and HTTPS HSTS; static CSP denies inline script attributes and plugins. Fingerprinted bundles have immutable caching, bundled photos have bounded caching, dynamic APIs retain no-store. No cross-origin credentialed API access is enabled.
- Dependency audit findings resolved using same-major patched Miniflare transitive sharp/undici overrides and a reproducible lockfile. Normal npm repair retained a stale nested sharp entry; an isolated clean resolution followed by `npm ci` verified the corrected tree. Compatibility updates stay inside declared ranges. CI audits high-severity findings; no `--force` repair or new dependency was used.
- Admin discovery now supports literal name/slug/SKU search, category, active/archived and low-stock filters with shared limits. Coverage review also completed sold-unit totals, all status counts and recent-order links in the database-backed overview. Daily analytics aggregates the requested UTC range once rather than joining every date to every order.
- Accessible administration section headings receive focus after navigation; all six sections remain visible in narrow layouts. Mobile Escape closes navigation and returns focus to its toggle. Image pickers have explicit names; admin errors receive focus. Account caches clear on account changes, while admin mutations refresh only affected resources.
- Migrations 0007/0008 add owner/status/created-time order pagination, idle-session and product-scoped stock indexes. It changes no business rows. Asset budgets and a real built-Worker local benchmark are executable scripts; the full check includes size regression gates.

## Budgets

| Mutations                              | Limit per account / 60 seconds |
| -------------------------------------- | ------------------------------ |
| Profile and delivery-address changes   | 60                             |
| Cart and wishlist combined             | 120                            |
| New checkout summaries                 | 20                             |
| Demo order attempts, including retries | 20                             |
| Customer cancellation                  | 12                             |
| All administration writes combined     | 60                             |

Limits use fixed windows, allowing boundary bursts. Invalid same-origin requests with valid CSRF consume allowance. Anonymous, unauthorized and bad-CSRF requests cannot consume someone else's allowance. Reads do not allocate counters. Login/register retain their stricter existing IP-first/account policies. These are bounded application controls, not network DDoS protection, public catalog quotas or a promise to fit every traffic level on a free plan.

## Files and commands

Core changes: `worker/middleware/rate-limit.ts`, security/auth middleware and route wiring, checkout/account/admin repositories, `db/migrations/0007_hardening_indexes.sql`, `shared/admin.ts`, administration/layout/form/cache frontend code, static headers, package lock/overrides, CI, tests and documentation.

```sh
npm ci
npm run db:migrate:local
npm run check
npm run format:check
npm audit --audit-level=high
npm run perf:api
npm run dev:api
```

## Verification

The complete run passed **182 tests**, zero failures/skips, TypeScript, zero-warning lint, Vite build, artifact budgets and Worker dry-run. After adding the measured stock index and final focus polish, the focused 15-result hardening suite passed again and types/lint/build/budgets/dry-run were rechecked. `npm audit --json` reports zero known findings; its output is retained in `dependency-audit.json`. Formatting was broadened to source, Worker/shared contracts, scripts, tests, docs and configuration. Local migrations 0007/0008 applied successfully (five and two commands), retaining existing accounts, roles, carts and orders.

The built-Worker benchmark ran 20 measured samples per endpoint/scenario on the seed catalog and an isolated 1,012-product / 1,000-order fixture. Its stock/search/price-sort bottleneck improved from local p95 708.65 ms to 46.11 ms after the product-scoped stock index. Raw before/after results and query plans are saved. Asset budgets passed: entry JS 75,738 gzip bytes, total JS 162,183, CSS 15,262; the 25 WebP photos total 1,704,958 bytes. These are measured local/artifact results only. Browser review verified literal SKU/category filtering, current admin access, focused product/order workspaces, the skip link, mobile Escape/return focus, all six administration sections and status/recent-order deep links. Rendered catalog/editor checks found no missing field labels, image alternatives, duplicate IDs or broken local images; the page had one main landmark. The 320px editor had no horizontal overflow. Final browser errors/warnings were empty, including under the stricter CSP. Screenshots: `phase-8-catalog.png`, `phase-8-mobile.png`, `phase-8-dashboard.png`. This was a targeted DOM/keyboard/visual review, not a comprehensive assistive-technology or WCAG audit. No real order, stock or product was changed during this browser review.

See [test coverage](testing.md) and [performance evidence](performance.md) for the commands and their limits. No successful cloud deployment is implied by a local Worker dry-run.

## Remaining release gates

Next is Phase 9, free-plan deployment preparation. Public account access still fails closed until secure password hashing is measured on actual Workers Free at the full work factor. Requested email verification remains deferred and must be completed before public account usage. Neither constraint is bypassed by this phase. Free quotas, credentials, HTTPS origin, backup/export/retention decisions and live acceptance checks must be verified during deployment. No true revenue, parcel dispatch, real refund or complete-security claim is made.

Relevant upstream notices: [Undici maintainer advisory](https://github.com/nodejs/undici/security/advisories/GHSA-w293-vg96-wgc3), [sharp maintainer advisory](https://github.com/lovell/sharp/security/advisories/GHSA-wq5f-xc86-pv6w). The recorded audit is a dated dependency check, not proof against undisclosed vulnerabilities.
