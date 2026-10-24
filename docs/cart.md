# Persistent shopping bag — Phase 5 cart increment

Historical cart increment implemented locally on 15 October 2026. Wishlist and the updated purchase-control placement have since been completed in [Phase 5](phase-5.md). Email verification remains planned for a later account-hardening phase; no verification mail is sent yet. The evidence below describes the earlier cart-only delivery.

## Working behavior

- Product pages add the chosen finish and quantity; collection cards quick-add one unit of the explicitly labeled available finish and price. Out-of-stock additions are disabled.
- The header shopping-bag link shows the saved count. `/cart` shows images, finishes, quantities, current unit/line prices, server-calculated subtotal, quantity editing and removal.
- Signed-out additions open login and return to the selected product/finish. Return destinations are restricted to known local routes. Items are not silently added after signing in.
- Cart data is owned by the authenticated account in D1, persists through reload/logout/login and is not stored in browser local storage. The existing logout clears query caches.
- Every mutation uses the session owner, CSRF and exact Origin. Strict bodies reject client prices and owner IDs. SQL guards enforce stock, cumulative quantity (1–20), active/unarchived variants and a 50-line cap. Cart edits never reserve or decrement inventory.
- Version checks protect quantity replacement/removal from stale edits. Migration 0004 advances cart versions on insert/update/delete. Current price and availability changes appear on reads; unavailable saved lines can still be removed. Failed transactions roll back cart creation as well as line writes.

## Files

Created: `shared/cart.ts`, `shared/return-path.ts`, `db/migrations/0004_cart_versions.sql`, `worker/repositories/cart.ts`, `worker/routes/cart.ts`, `src/features/cart/query.ts`, `src/components/AddToCart.tsx`, `src/pages/Cart.tsx`, `src/styles/cart.css`, `tests/cart.test.mjs`, this report and cart screenshots.

Updated: Worker route wiring; product cards/detail, header/icon/router/auth return navigation; Account/About/Shop status copy; SQL test helper for the new simple trigger bodies; README and API/security/frontend/roadmap documentation. No dependencies were added.

## Commands and verification

```sh
npm run db:migrate:local
npm run check
node --test tests/cart.test.mjs
npm run format:check
npm run dev:api
```

- Full `npm run check` passed with **86 tests**, zero failures/skips, types, zero-warning lint, production build and Worker dry run.
- Expanded cart suite then passed **18 tests**, including an added real password login after logout that restores the exact saved cart. The earlier full suite included 17 of these cart tests. This is 87 distinct passing automated cases across the runs.
- Local Wrangler applied migration 0004 successfully. Strong password work factors and public-auth release gates are unchanged.
- Browser verification: collection quick-add, a different finish with quantity two from the product page, quantity change and server subtotal update, removal of one finish while retaining another, and full-reload persistence. Desktop and 800/390/320 px layouts checked for horizontal overflow; narrow collection buttons and product quantity controls were reviewed after the final build. Captured browser warnings/errors were empty. Existing signed-in account session was preserved during browser QA; logout/login persistence was exercised in isolated D1 tests. Only QA-added lines were removed afterward, restoring the initially empty cart; screenshots show the populated test state. Temporary viewport overrides were reset and the product preview was left ready.
- Screenshots: `cart-desktop.png`, `cart-mobile.png` and `cart-product.png`. These depict illustrative catalog goods and prices.

Final presentation-only refinements use the shared paise-preserving price formatter, correct the singular item label and fit quick-add buttons on narrow cards. Types/lint/format/build are rechecked after these refinements; no backend behavior changed after the full suite.

## Limits and next work

Authenticated carts only. Guest carts/merging, wishlist and checkout remain pending. Subtotal includes flagged lines at their current catalog prices; it is not a final payable quote. Shipping/tax, orders, atomic inventory changes and idempotent demo payment belong to checkout. Add requests are cumulative and are not idempotent; automatic mutation retries are disabled. A conflict refreshes cart data for review.

No public deploy, live cloud CPU validation, GitHub publication, real orders, email delivery or charges. Public accounts remain disabled until the existing release gate is satisfied. `/api/health` retains Phase 4 as the last fully completed phase while the Phase 5 cart increment is available locally.

Next: finish the wishlist portion of Phase 5, then Phase 6 server-priced demo checkout. Add email verification during account hardening before public account usage, with real delivery, expiring single-use hashed tokens, resend throttling and verification-state tests.
