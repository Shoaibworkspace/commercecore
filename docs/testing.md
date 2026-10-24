# Testing and local release checks

Run `npm ci`, `npm run check`, `npm run format:check` and `npm audit --audit-level=high`. The full check includes TypeScript, zero-warning ESLint, executable unit/integration tests, the frontend build, gzip/photo size budgets and a Worker dry-run. CI runs the same gates on push/PR. No remote database or real payment is used.

## Acceptance coverage

| Requirement                                                                                                                                          | Executable evidence                                                |
| ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Valid/invalid login, hashing, sessions, rotation, expiry, login abuse, CSRF, roles and privilege injection                                           | `tests/auth.test.mjs`                                              |
| Cart add/remove, quantity/stock/variant validation, persistence and competing updates                                                                | `tests/cart.test.mjs`                                              |
| Wishlist ownership, persistence and exactly-once cart transfer                                                                                       | `tests/wishlist.test.mjs`                                          |
| Catalog search/filter/sort/page, SQL-like values, local imagery and bounded management inputs                                                        | `tests/catalog.test.mjs`, `tests/catalog-api.test.mjs`             |
| Successful/declined demo order, totals, last-unit races, duplicate keys, multi-item rollback and snapshots                                           | `tests/checkout.test.mjs`                                          |
| Order ownership, valid/invalid transitions, cancellation races, multi-line stock restoration and terminal states                                     | `tests/admin.test.mjs`                                             |
| Anonymous/forged admin denial, catalog audit, stale writes, stock adjustments and DB-derived analytics                                               | `tests/admin.test.mjs`                                             |
| Shared mutation rate-limit races/expiry, fail-closed counters, oversized input, discovery filters, skipped address writes and supporting query plans | `tests/hardening.test.mjs`                                         |
| Errors/headers, database readiness, schema constraints and D1 rollback                                                                               | `tests/api.test.mjs`, `tests/schema.test.mjs`, `tests/d1.test.mjs` |
| Availability cache invalidation without refetching account resources                                                                                 | `tests/frontend-cache.test.mjs`                                    |

Integration tests create fresh Miniflare D1 databases. Fault injection uses temporary database triggers, including ABORT and IGNORE, to prove that failed or silently skipped writes do not leave partial changes. Concurrency uses competing requests sharing the same database. Tests use disposable session/account fixtures rather than default application credentials. Migration/seed helpers preserve complete trigger bodies.

## Repeatable performance evidence

After `npm run check`, run `npm run perf:api`. This loads the built Worker in local workerd with isolated D1 and fictional seed/synthetic data. It reports first-request, warmed p50/p95/max wall time and response bytes. `npm run perf:assets` checks built bundles and photographs. Results and conditions are in [performance](performance.md); these do not measure cloud CPU, browser LCP or public capacity.

## Browser review

Use the normal preview with `npm run dev:api`. Check keyboard focus, skip link, mobile menu Escape/return focus, administration section focus, native form labels, search/category/visibility/stock filters, order links, narrow layouts, current CSP and browser logs. Review unlabelled controls, missing image alternatives, duplicate IDs and broken local images on rendered pages. This is a targeted accessibility review, not a WCAG conformance certification or a replacement for assistive-technology testing.

Keep real customer data out of destructive QA. Use a separate `--persist-to` directory if exercising checkout, fulfillment or cancellation. Browser sessions on the same hostname share cookies across ports; separate hostnames or controlled test sessions are necessary. Never submit demo cancellation against an unrelated user's existing order.
