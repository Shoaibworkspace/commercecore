# Phase 6 — Reliable demo checkout and customer orders

Local implementation of server-priced quotes, saved Indian delivery addresses, an explicit demo-only payment outcome, atomic inventory/order creation, idempotent retries and owned order history. Add to cart remains below price. Email verification remains on the later account-hardening roadmap.

## Behavior and policy

Cart → delivery address → server order summary → Demo Checkout — No Real Charge → saved confirmation. Checkout can add a sample address using the existing validated address form. `/orders` lists ten owned orders per page; `/orders/:id` reads historical item, price and delivery snapshots. Other customers receive 404 for non-owned order IDs.

The source-configured illustrative policy is INR, ₹79 shipping below ₹2,500, free shipping from ₹2,500, and 5% tax on item subtotal rounded to the nearest paise. Shipping is not taxed in this demonstration. This is a portfolio policy, not a representation of actual tax law or a tax invoice. Amounts remain integer paise throughout. Quotes expire after ten minutes; at most five unused quotes are retained per account. Used quotes are retained with orders.

Successful simulation confirms an order, reduces every sample-stock row, writes item snapshots and negative ORDER ledger movements, clears only the quoted owned cart and records the request key/audit event. Declined simulation returns 402 and creates no order, key or inventory/cart changes. No card fields, gateway calls, real money, email or physical fulfillment exist.

## Atomicity and consistency

1. Quote creation reads address/cart/variant data from one SQL snapshot. The client supplies only its saved address ID and expected cart version. Server calculations and snapshots are stored in `checkout_quotes`.
2. Order placement uses a D1 session starting at `first-primary`. It first checks the account-scoped idempotency key and canonical request hash, then the owned quote/expiry/policy version.
3. A D1 batch inserts the order, request-key record and audit event. The order BEFORE trigger revalidates quote ownership, address/cart versions, expiry/policy, header totals/delivery, exact line count/quantities, product activity, quoted price/SKU/label/name and available stock.
4. The AFTER trigger inserts item snapshots, decrements inventory and increments variant versions, writes ledger rows and clears the quoted cart. Explicit affected-row checks abort on skipped item, stock, ledger or cart writes. SQLite constraints and `RAISE(ABORT)` cause the D1 batch to roll back all effects, including cart-version triggers and any already changed stock.
5. A unique quote index prevents two distinct keys from ordering the same quote. `(user_id,key)` and a request hash prevent key reuse for another payload. Concurrent matching requests return the same committed order; mismatches return 409. Recovery reads use the same primary-started session.

This uses the documented [D1 batch transaction behavior](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch), not a JavaScript transaction callback or separate optimistic stock updates. The [D1 Database API](https://developers.cloudflare.com/d1/worker-api/d1-database/#withsession) describes session constraints. Integration evidence below is local D1/workerd evidence; no cloud performance or throughput is claimed.

Used quote/address snapshots are retained even if the saved address is later removed; `address_id` is deliberately a version-checked reference without a restricting foreign key. Unused quotes are pruned when the same account requests new quotes. Successful idempotency records do not expire in this phase. Declines do not reserve keys, so a later successful attempt should use a fresh key. Retries of a committed success work after quote expiry and do not clear items added afterward.

The UI keeps the active attempt key in component memory and reuses it for a retry of the same reviewed summary/outcome. Changing outcome or refreshing summary starts a new attempt. Reloading loses this transient key, but unique quote/cart-version guards still prevent duplicate orders; My orders provides recovery. There is no claim of cross-device or offline attempt-key storage.

## Created and changed files

- Data/contracts: `db/migrations/0005_checkout.sql`, `shared/checkout.ts`; shared return-path allowlist.
- Backend: `worker/repositories/checkout.ts`, `worker/services/checkout.ts`, `worker/routes/checkout.ts`; app/errors/health/readiness wiring.
- Frontend: `src/pages/Checkout.tsx`, `Orders.tsx`, `Order.tsx`, `src/features/checkout/query.ts`, reusable `AddressForm.tsx`, `OrderSummary.tsx`, `src/styles/checkout.css`; cart action, account/order navigation, auth-cache clearing, routes and status copy. The address form was extracted without changing its account validation behavior.
- Verification: `tests/checkout.test.mjs`, trigger-aware SQL script helper, health phase assertion, wishlist migration fixture; README/API/architecture/security/frontend/roadmap and this report.

No dependency was added. The additive migration introduces a seventeenth application table for server quotes, order quote linkage/uniqueness, historical images and two checkout triggers. Existing historical order rows can retain null quote linkage; application checkout always sets it.

## Commands and verification

```sh
npm run db:migrate:local
npm run check
npm run format:check
npm run dev:api
```

Initial focused checkout verification passed 31 tests: successful multi-item order, decline, same-key retry after expiry/new cart items, duplicate/concurrent keys, competing customers for the last unit, shortages, stale price/address/cart/activity/expiry/policy, failure injection at item/ledger/cart/key/audit stages, silent stock/cart skips, historical snapshots and customer ownership. Account-scoped key and pagination boundary cases were then added for the full run.

The Phase 6 full run passed **137 tests**, with zero failures or skips; types, lint, build and Worker dry-run passed. Migration 0005 applied locally (8 commands). Browser review covered desktop and 320/390px layouts, saved-address selection, two deliberate declines without effects, successful checkout, cart clearing, order history and receipt reload. Error/review focus was improved and types, lint and build rechecked. Screenshots: `phase-6-address.png`, `phase-6-review.png`, `phase-6-checkout-mobile.png`, `phase-6-declined.png`, `phase-6-confirmation.png`, `phase-6-receipt.png`, `phase-6-order-mobile.png`.

A separate disposable customer placed one local demo tote order: stock 20 → 19 with its matching ORDER ledger. The existing shopper's cart was preserved at its original quantities. Only sample delivery details were used. No money or email was sent.

## Release limits and next phase

Local demonstration only. Public authentication still fails closed pending secure-hashing CPU verification on actual Workers Free. No public deploy, real administrator provisioning, emails or payments were introduced. API abuse/retention/operational monitoring and production limits still require hardening. Server-side transaction correctness does not establish free-plan capacity.

Shipping supports the existing saved Indian addresses only. No guest checkout, real taxes, gateway, delivery dates, notifications or real fulfillment. Cancellation, exact-once stock restoration and admin order/status/inventory controls belong to **Phase 7 — Administration**. Email verification remains later account hardening as requested.
