# Phase 5 — Persistent cart and wishlist

Local delivery on 15 October 2026. Complete the wishlist portion of Phase 5 and place Add to cart immediately below price, as requested. Product pages show color selection before price and quantity/purchase controls directly after it. Collection cards also put quick add below the price, ahead of description and View product.

## Working features

- Heart controls on product photos/cards and a labeled wishlist control on the product page. Account-owned favorites persist in D1, with idempotent save/remove and a 50-product limit.
- `/wishlist` has saved product photos, current prices, color/quantity selection, removal and Move to cart. Out-of-stock or unavailable products stay saved; unavailable products remain removable. Loading, signed-out, empty, error, pending and success states are implemented.
- Desktop header wishlist navigation and a mobile-menu wishlist link. Login returns safely to `/wishlist` or the chosen product. Query caches are user-scoped and cleared on account changes/logout.
- Moving uses one D1 batch: ensure the owned cart, conditionally add the selected owned product variant with stock/quantity/line-limit guards, then remove the favorite only if the outer cart statement changed a row. Cart-version triggers do not replace SQLite's outer `changes()` value. A SQL exception rolls back the complete batch, including version changes. Failed availability/ownership guards leave the favorite intact. Concurrent moves of the same saved item produce one winner, without duplicate additions.
- No inventory is reserved or decremented. No client owner, role or price is accepted. All wishlist mutations use the existing session, exact Origin, CSRF and bounded strict JSON validation. No schema migration or new dependency was needed for wishlist.

## Files

Created: `shared/wishlist.ts`, `worker/repositories/wishlist.ts`, `worker/routes/wishlist.ts`, `src/features/wishlist/query.ts`, `src/components/WishlistButton.tsx`, `src/pages/Wishlist.tsx`, `src/styles/wishlist.css`, `tests/wishlist.test.mjs`, this report and Phase 5 screenshots.

Updated: shared cart-statement construction, API route wiring/readiness/health status, local return-path allowlist, product controls/cards, icons, header/mobile navigation, lazy routes, login cache clearing, Account/About status, and README/API/frontend/security/roadmap documentation. Existing cart migration 0004 remains required.

## Run and verify

```sh
npm run db:migrate:local
npm run check
npm run format:check
npm run dev:api
```

Targeted cart and wishlist checks passed: **34 tests** before the added readiness-trigger case. They cover anonymous denial, CSRF/origin, strict owner/price/quantity validation, bound invalid IDs, idempotent saves, user ownership, live availability, mismatched variants, stock failure retention, cumulative cart limits, exactly-once concurrent move, injected deletion failure with complete rollback, archived/inactive removal, concurrent favorite caps and real logout/password-login persistence.

Final verification passed:

- `npm run check`: **104 tests, zero failures/skips**, frontend/Worker type checks, zero-warning lint, production frontend build and Worker dry run. The wishlist suite contributes 17 results, including the readiness-trigger case. The two sanitized `request_failed` events are deliberate rollback-injection tests; provider details are not exposed.
- `npm run format:check` passed, with explicit formatting checks for the new shared/Worker/test files and this report.
- Browser: saved a favorite from the product page and another from a card; both remained after full reload. Selected Forest and quantity two for Daily Canvas Tote, moved it to cart, and verified Forest × 2 with server subtotal ₹2,598 while the other favorite remained. Removal and empty states worked. Logout/password-login persistence is covered by isolated D1 integration tests; the current browser account session was preserved.
- Price/control placement inspected on product pages and collection cards at desktop and 320 px. Wishlist reviewed at desktop, 800, 390 and 320 px; mobile menu exposed the saved-list link. DOM scroll width equaled client width at each reviewed breakpoint. No captured browser warnings/errors remained. Temporary viewport overrides were reset.
- QA started with empty cart/wishlist. Only QA-added products were removed afterward, restoring those empty lists. Screenshots show the populated test state; no personal profile/address data was changed. The updated product preview remains available locally on port 8787.
- Screenshots: `phase-5-product.png`, `phase-5-product-mobile.png`, `phase-5-collection.png`, `phase-5-wishlist.png`, `phase-5-mobile.png`, `phase-5-moved-cart.png`.

Final artifacts: CSS 58.75 kB / 12.59 kB gzip; main JS 242.78 kB / 75.58 kB gzip plus shared/query chunks; lazy Wishlist route 5.34 kB / 1.86 kB gzip. Worker dry run 879.84 KiB / 147.25 KiB gzip. Bundle sizes are not cloud CPU/throughput evidence.

## API

- GET `/api/wishlist` → `{data: WishlistEntry[], requestId}`. Entries contain productId, slug, name, subtitle, local image, availability and active variants. Reads use one SQL snapshot; empty reads do not create rows. Archived products return no purchasable variants.
- PUT `/api/wishlist/items/:productId` with `{}` → save idempotently, 200 with list. Only currently visible products can be newly saved; out-of-stock products may be saved. A full list or unavailable/missing product returns 409.
- DELETE the same URL with `{}` → remove idempotently, 200 with the owned list. Other users' entries are untouched and never disclosed.
- POST `/api/wishlist/items/:productId/move` with `{variantId,quantity}` → atomic transfer, 200 with `{data:{wishlist,cart},requestId}`. Quantity 1–20, active owned favorite and matching product variant required. Guard failure returns 409 and preserves the favorite. Retrying after a successful move without re-saving returns 409 and does not add again. Re-saving then moving is a new user action, not an idempotency-key API.

All mutations require JSON and reject extra fields. Auth/CSRF/Origin, validation and internal-error semantics follow the existing API contracts. Responses after the atomic mutation are fresh reads; concurrent later changes may appear in them.

## Limits and next phase

This is a local functional Phase 5 delivery. Public authentication is still disabled pending actual secure-hashing CPU evidence on Workers Free. No deployment, default administrator, real charges, emails or physical orders were created. Authenticated carts/favorites only; no guest merging or undo history. Automated integration tests use isolated local D1; browser review is manual.

**Next: Phase 6 — server-priced demo checkout**, shipping/tax configuration, address selection, atomic multi-item inventory, order creation and idempotency. Email verification stays on the later account-hardening roadmap, before public account use, as requested.
