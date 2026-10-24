# Prioritized implementation plan

Build one functional phase at a time. A phase ends with commands, results, changed files, limitations, and the next phase. Do not advertise incomplete functionality as implemented.

| Phase | Deliverable                                                                                                          | Acceptance gate                                                                                                                     |
| ----- | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 1     | Architecture, 16-table schema, seed, React/Hono foundation, environment config, CI                                   | Types/lint/tests/build and local D1 migration/seed pass                                                                             |
| 2     | Responsive storefront, design system, product/category/detail pages, local legal imagery, empty/loading/error states | Keyboard/mobile/browser review; all visible catalog interactions work on typed sample data; explicitly marked preview until Phase 3 |
| 3     | D1-backed catalog/search/filter/sort/pagination; product management data layer                                       | Valid queries, missing products, bound malicious inputs, migration/seed verified; do not expose unauthenticated admin writes        |
| 4     | Registration/login/logout, HttpOnly sessions, CSRF, profile/addresses, roles                                         | Login and abuse tests; ownership/admin denial tests; secure hashing measured on Free before enabling public auth                    |
| 5     | Persistent authenticated cart and wishlist — implemented locally                                                     | Add/remove/quantity/invalid variant and atomic wishlist-move tests; state persists through reload/login                             |
| 6     | Server-priced quote, demo checkout, transactional inventory, idempotency, customer orders — implemented locally      | D1 concurrency, multi-item rollback, retry, totals, ownership and failure-injection tests pass                                      |
| 7     | Admin catalog UI, inventory adjustments/ledger, fulfillment, cancellation, demo analytics — implemented locally      | Protected APIs, valid/invalid transitions, exactly-once restoration; charts match database                                          |
| 8     | Hardening, full security/integration suite, performance evidence, accessible polish — implemented locally            | Every requested automated case runs; no known critical correctness/security failure                                                 |
| 9     | Free-plan provisioning, migration, HTTPS public workers.dev URL, deployment workflow                                 | Live signup/login/cart/checkout/admin denial verified; quotas and manual account steps documented                                   |
| 10    | Final architecture/ER/API/security/system-design evidence, interview scenarios and resume summary                    | Trace acceptance checklist to implemented code/tests/live evidence                                                                  |

Highest-priority risks: free CPU vs password hashing; transaction guards for zero-row conditional updates; stale cart/price changes; cancellation races; quota exhaustion; admin provisioning. Resolve these explicitly, not by weakening hashing or optimistic stock checks.

Admin changes planned in Phase 3 can be tested below the HTTP layer, but mutation APIs must remain inaccessible until server-side authentication and roles exist.

**Requested follow-up (15 October 2026): email verification.** Implement this in a later account-hardening phase before public account usage: a real email delivery provider with documented free limits, single-use hashed verification tokens with expiry, resend throttling and a verified-email state. Verify token expiry/replay and account ownership. Email delivery is not connected and verification is not implemented yet. Password recovery and real order notifications remain separate future work; do not present them as available.
