# REST module contracts

Implementation: `backend/src/routes/`, with shared schemas in `shared/`. These contracts apply to the local and hosted demo; hosted authentication uses the provider boundary described in [security](security.md). Phase numbers below are historical implementation milestones, not separate deployments.

## Hosted confirmation and recovery

- POST `/api/auth/register` returns a confirmation-required result on the hosted store; it does not log the user in.
- POST `/api/auth/login` creates the app session only after validating a confirmed provider identity.
- POST `/api/auth/recover` accepts a registered email-shaped value and returns a generic recovery acknowledgement.
- POST `/api/auth/reset-password` accepts a recovery access token and a new password, validates them with the provider, and revokes mapped app sessions after a successful change.

All four forms enforce exact Origin, CSRF, bounded JSON and rate limits. Hosted passwords are at least 15 characters and at most 72 UTF-8 bytes. Provider tokens must not appear in logs, browser storage, public examples or persisted application sessions.

## Route overview

Responses use `{ data, requestId }` or `{ error: { code, message }, requestId }`. Product lists add `meta: { page, pageSize, total, totalPages }`. JSON uses camelCase; SQL uses snake_case. Unknown `/api/*` routes return JSON 404. `/api/admin/*` requires a real session and database admin role: anonymous requests get 401, customers 403. Admin reads and mutation routes below are implemented. Mutation handlers also enforce Origin and session CSRF; unknown admin routes return 404 after authorization.

| Module          | Routes                                                                                                        | Permission                                 | Phase / status                               |
| --------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | -------------------------------------------- |
| Diagnostics     | GET `/api/health`, GET `/api/ready`                                                                           | Public                                     | 1 / implemented                              |
| Catalog         | GET `/api/products`, GET `/api/products/:slug`, GET `/api/categories`                                         | Public                                     | 3 / implemented and D1-backed                |
| Auth            | POST `/api/auth/register`, `/api/auth/login`, `/api/auth/logout`; GET `/api/auth/session`                     | CSRF-protected forms; authenticated logout | 4 / implemented; hosted confirmation enabled |
| Profile         | GET/PATCH `/api/me`                                                                                           | Authenticated owner                        | 4 / implemented                              |
| Addresses       | GET/POST `/api/me/addresses`; PATCH/DELETE `/api/me/addresses/:id`                                            | Authenticated owner                        | 4 / implemented                              |
| Cart            | GET `/api/cart`; POST `/api/cart/items`; PUT/DELETE `/api/cart/items/:variantId`                              | Authenticated owner + CSRF                 | 5 / implemented                              |
| Wishlist        | GET `/api/wishlist`; PUT/DELETE `/api/wishlist/items/:productId`; POST `/api/wishlist/items/:productId/move`  | Authenticated owner + CSRF                 | 5 / implemented                              |
| Checkout        | POST `/api/checkout/quote`; POST `/api/checkout` with `Idempotency-Key`                                       | Authenticated owner + CSRF                 | 6 / implemented                              |
| Orders          | GET `/api/orders`, GET `/api/orders/:id`, POST `/api/orders/:id/cancel`                                       | Authenticated owner; CSRF on cancellation  | 6–7 / implemented                            |
| Admin catalog   | GET/POST `/api/admin/products`, GET/PATCH product detail; category, variant, archive and gallery routes below | Admin; CSRF for writes                     | 7 / implemented                              |
| Admin inventory | GET `/api/admin/inventory/movements`; POST `/api/admin/inventory/:id/adjust`                                  | Admin; CSRF for writes                     | 7 / implemented                              |
| Admin orders    | GET `/api/admin/orders`, GET `/api/admin/orders/:id`; PATCH `/api/admin/orders/:id/status`                    | Admin; CSRF for writes                     | 7 / implemented                              |
| Analytics/audit | GET `/api/admin/analytics`, GET `/api/admin/audit`                                                            | Admin                                      | 7 / implemented                              |

Planned HTTP semantics: 201 created; 200 successful read/update; 204 deletion/logout; 400 malformed input; 401 unauthenticated; 403 role/CSRF violation; 404 resource inaccessible/missing; 409 stock/state/idempotency conflict; 413 oversized payload; 429 abuse limit; 500 unexpected internal error; 503 service unavailable. Business failures must not be hidden as HTTP 200.

## Implemented catalog contracts

`GET /api/categories` returns `{ data: Category[], requestId }`. Categories include id, slug, name, description and a local image path. Names and navigation come from the database.

`GET /api/products` returns a page of products with active variants, photo paths, gallery records, category name and metadata. Archived products and products without active variants/gallery records are excluded.

| Query                  | Accepted values                                                                                                                             |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `q`                    | At most 100 characters / 400 UTF-8 bytes; trimmed literal substring over name, description, category slug and material                      |
| `category`             | Lowercase hyphenated slug, max 150 characters; an unknown valid slug has zero matches                                                       |
| `minPrice`, `maxPrice` | Integer **paise**, 0–100000000; minimum must not exceed maximum                                                                             |
| `stock`                | `1` requires positive stock on the same variant matching the price range; `0` applies no stock restriction                                  |
| `sort`                 | `featured` (default), `newest`, `price-asc`, `price-desc`, `name`                                                                           |
| `page`                 | 1–10000, default 1; pages beyond available results clamp to the final page                                                                  |
| `pageSize`             | 1–24, default 6                                                                                                                             |
| `featured`, `new`      | Optional `0`/`1` boolean filters for home sections                                                                                          |
| `sale`                 | Optional `0`/`1`; `1` requires an active variant with comparison price greater than its selling price, composed with price/stock predicates |

Unknown or repeated parameters, invalid integers/enums and inverted price ranges return 400 `INVALID_QUERY`. Empty results return `data: []`, `total: 0`, `totalPages: 1`, `page: 1`. Sorting has deterministic name/id tie breakers; price sorting uses the minimum active variant price. `newest` places `isNew` items first, then name/id; it is a curated new-arrivals flag, not an invented timestamp order.

Example: `/api/products?category=home&minPrice=70000&maxPrice=120000&stock=1&sort=price-asc`.

Public variants expose `size` (empty for unsized goods) and nullable `compareAtMinor`, both in addition to `priceMinor`. Selling prices remain authoritative for quotes and orders. Comparison prices only support the display of sample offers. The database and admin input schemas require a comparison price strictly above the selling price.

`GET /api/products/:slug` returns `{ data: { product, related }, requestId }`, with up to three same-category related products excluding the selected product. Missing/archived products return 404 `PRODUCT_NOT_FOUND`. Read failures or invalid database response data return 503 `CATALOG_UNAVAILABLE` without provider/SQL details.

Query values use prepared statement bindings; sorting comes only from a fixed SQL allowlist. `instr(lower(...), lower(?))` treats `%`, `_` and SQL-looking text as literal substrings. SQLite lower/collation currently provide ASCII case folding; full Unicode normalization is future work. List totals and product data come from one SQL snapshot with no per-product round trips. All API responses currently use `Cache-Control: no-store`.

## Catalog management boundary

`backend/src/services/catalog-management.ts` implements category create/update, atomic product + variants + gallery create, version-checked product/variant/category updates, archive/unarchive, bounded variant creation and gallery image upserts. Zod validates strict input objects, integer paise, local `/images/...` paths and a hex swatch. Product creation rolls back as one D1 batch on any SQL failure. Metadata edits use compare-and-swap versions and return 409 on stale or missing records. Product/variant IDs are retained; no hard-delete operation is exposed.

New variants start at zero stock. Management input rejects `stock`; existing stock and its ledger are never changed by price/metadata updates. Phase 7 exposes authenticated management screens and atomically audited writes; inventory adjustments use a separate ledger-driven transaction. Gallery positions 0/1 describe the selectable variant views; positions 2–11 are additional gallery assets. Only already bundled local image paths are supported; uploads are unavailable and admin HTTP inputs must match the bundled asset allowlist.

The services are called only after route middleware verifies the current session role, Origin and CSRF. A spoofed role/header never enables writes. Checkout accepts address and simulation choice, never trusted client prices or totals.

`/api/health` reports Phase 8 liveness without D1 access. `/api/ready` probes catalog/account/cart/wishlist schema columns and the cart/checkout/administration triggers, returning 503 when unreachable/unmigrated. Request IDs are generated internally. See [account/security contracts](security.md) for production gating and assumptions.

## Implemented account contracts

`GET /api/auth/session` returns `{data:{user: User|null,csrfToken},requestId}` and may set a signed pre-login HttpOnly cookie. Production is disabled until release verification/configuration; unavailable auth returns 503. Credentials are never returned.

All mutations require the exact `Origin` and `X-CSRF-Token` from the current bootstrap/session, with no cross-site Fetch Metadata. JSON bodies have an 8 KiB cap. Invalid MIME returns 415, oversized body 413, strict validation 400, missing/expired auth 401, role/CSRF/origin failures 403, stale versions/duplicate registration/address limit 409, abuse limits 429 plus Retry-After.

- Register body: `{name,email,password}`; 201 returns the session envelope and rotates to an authenticated HttpOnly cookie. Role/ID injection is rejected; role defaults to customer. User and session creation are one transaction.
- Login body: `{email,password}`; 200 returns the session envelope. Wrong/missing account has the same generic 401 message. Passwords are never truncated. Login rotates/revokes the presented session.
- Logout: POST with CSRF, no body needed; 204 revokes the current session and clears its cookie.
- GET `/api/me`: `{data:{id,name,email,role,version},requestId}`. PATCH accepts **only** `{name,version}` and returns the updated user. Email/password changes are not implemented.
- GET `/api/me/addresses`: `{data:Address[],requestId}` scoped to the current user. POST accepts `{recipient,line1,line2,city,region,postalCode,countryCode,phone,isDefault}`; line2 defaults empty and countryCode defaults `IN`. Returns 201 with one Address. Ten addresses maximum.
- PATCH `/api/me/addresses/:id`: the same full address fields plus `version`; 200 returns updated Address. DELETE accepts `{version}` JSON and returns 204. Non-owned IDs return 404 without leaking existence. Address includes `id` and optimistic `version`; it never accepts `userId`.
- GET `/api/admin/status`: session + real database admin required; returns role and current internal-management/dashboard implementation status. No admin is seeded or auto-promoted.

Saved addresses currently support India only (six-digit PIN and normalized 10–15-digit phone). Version/default/cap checks are enforced in D1. No order or payment write is implemented yet.

## Implemented wishlist contracts

GET `/api/wishlist` returns `{data: WishlistEntry[], requestId}` with productId, slug, name, subtitle, local image, availability and active variants. Archived/inactive saved products stay removable. Empty reads create no rows. Lists are scoped to the current session owner and capped at 50 products.

PUT `/api/wishlist/items/:productId` with strict `{}` saves idempotently; DELETE with strict `{}` removes idempotently. Both return 200 with the list. Invalid IDs/input return 400; unavailable products or list limits return 409. Out-of-stock products may still be saved.

POST `/api/wishlist/items/:productId/move` accepts **only** `{variantId,quantity}` (integer 1–20) and returns 200 with `{data:{wishlist,cart},requestId}`. The variant must belong to the owned favorite and pass current cart/stock/activity limits. The cart addition and favorite removal are one D1 batch transaction. Failed guards return 409 and retain the favorite; SQL failures roll back quantity and cart-version changes as well. Concurrent moves of one favorite add once. Retrying a successful move after the favorite has gone returns 409; re-saving then moving is a new action. No inventory is reserved/decremented. The post-mutation list/cart are fresh reads, so later concurrent edits may appear in them.

All wishlist mutations require the current session, exact Origin, CSRF and bounded JSON. Client owner IDs, prices and extra fields are rejected. See [test coverage](testing.md) for concurrency and injected-failure results.

## Implemented checkout and order contracts

POST `/api/checkout/quote` accepts only `{addressId,cartVersion}`; 200 returns a server quote with ID, ten-minute expiry, INR totals, delivery and item snapshots. The saved address must be owned, cart current/nonempty, and all lines active with sufficient sample stock. An expired or stale quote requires review. Source policy: shipping 7900 paise below 250000 subtotal, free from 250000, illustrative tax 500 basis points on items subtotal rounded to nearest paise. No real tax-law/invoice claim.

POST `/api/checkout` accepts only `{quoteId,simulation:'success'|'failure'}` and requires `Idempotency-Key` (16–128 letters, digits, underscores or hyphens). Success returns 201 `{data:Order,replayed:false,requestId}`; a matching committed retry returns 200 with the same order and replayed true. Changed key payloads or consumed/stale/expired quotes return 409. Non-owned/missing quote IDs return 404. Demo decline returns 402 DEMO_PAYMENT_FAILED and creates no order/key or stock/cart changes. A new outcome should use a fresh key. No real payment data is accepted.

Order insertion, item snapshots, all stock decrements, ORDER ledger entries, exact cart clearing, idempotency key and audit event commit as one D1 batch. Trigger guards fail inside the transaction, including when conditional mutations skip rows. Stock and cart are not partly changed on failure. A committed retry is resolved before checking quote expiry or current cart state. The quote can create only one order across all keys.

GET `/api/orders?page=1` returns `{data:OrderSummary[],meta:{page,total,totalPages},requestId}`, ten rows per page, stable newest-first ordering, pages 1–9999. Extra/repeated/invalid parameters return 400. GET `/api/orders/:id` returns the owned order snapshot envelope or 404. No account ID is accepted. Current order creation produces CONFIRMED / SIMULATED_SUCCESS / demo; Phase 7 implements fulfillment and cancellation below. See [test coverage](testing.md) for retention, retry and local-test evidence.

## Implemented cart contracts

Every cart endpoint requires an authenticated session; mutations also require exact Origin, session CSRF and bounded JSON. Owner identity is always read from the session. No guest cart or browser-stored cart data is implemented.

- GET `/api/cart`: `{data:{version,currency:'INR',items,itemCount,subtotalMinor,hasIssues},requestId}`. Each item includes variantId, productId, slug, name, label, local image path, quantity, stock, unitPriceMinor, lineTotalMinor and nullable issue (`UNAVAILABLE` or `INSUFFICIENT_STOCK`). Current prices and integer-paise totals are read from D1 in one snapshot. Empty reads do not create carts.
- POST `/api/cart/items`: **only** `{variantId,quantity}`. Adds quantity cumulatively to the authenticated cart; successful requests return 200 with the cart envelope. A retry is another addition; automatic mutation retries are disabled in the UI.
- PUT `/api/cart/items/:variantId`: **only** `{quantity,version}`. Sets the quantity using the expected cart version; can insert a missing line when the version matches. Returns 200 with the cart envelope.
- DELETE `/api/cart/items/:variantId`: **only** `{version}` JSON. Removes the owned line with the expected cart version; returns 200 with the cart envelope. Unavailable items remain removable.

Quantity is an integer 1–20. At most 50 distinct variant lines may be added through the API. Activity, product archival, stock, cumulative quantity and line limits are guarded in the mutation SQL. Stock is never reserved/decremented by the cart. Migration 0004 triggers advance the cart version for inserts, quantity updates and deletions. Stale edits, missing lines/variants, unavailable stock or cart limits return 409; invalid bodies/IDs return 400. Client prices, totals and owner IDs are rejected.

Archived/inactive and insufficient-stock lines stay visible for correction/removal. Subtotal includes all saved quantities at current prices, including flagged lines; it is not a final payable quote. Tax, shipping, inventory reservation and checkout are future work. Successful mutation responses are freshly read snapshots and may include a subsequent concurrent change. UI invalidates cart data after mutations and checks again on page focus; a 409 refreshes the cart for review.

## Implemented administration contracts

GET `/api/admin/products?page=1` returns 20 product summaries including archived entries, total stock and versions. GET `/api/admin/products/:id` returns full metadata, gallery and all active/inactive variants with stock/version. GET `/api/admin/categories` returns up to 100 categories with versions. Admin endpoints use `{data,requestId}`; paginated reads add `{meta:{page,total,totalPages}}`. Page values are 1–9999; unsupported or repeated parameters are rejected.

Catalog writes use strict shared schemas (`shared/admin.ts`):

- POST `/api/admin/categories`; PATCH `/api/admin/categories/:id` adds required `version`. Fields: `{slug,name,description,image}`.
- POST `/api/admin/products`: metadata `{categoryId,slug,name,description,subtitle,material,dimensions,care,featured,isNew}` plus 1–20 `variants` and 1–12 `gallery` entries. At least one new variant must be active. Initial stock is zero.
- PATCH `/api/admin/products/:id`: complete metadata plus `version`. PATCH `/api/admin/products/:id/archive`: `{version,archived:boolean}`.
- POST `/api/admin/products/:id/variants`; PATCH `/api/admin/variants/:id` adds `version`. Fields: `{sku,label,color,size,priceMinor,compareAtMinor,image,detailImage,active,position}`. Comparison price is nullable/optional (default null), and must exceed selling price when supplied. Prices are integer paise; metadata rejects `stock`.
- PUT `/api/admin/products/:id/images/:position`: `{version,image,alt}`, position 0–11. Gallery changes advance the parent product version. Images must already exist in the bundled allowlist.

POST `/api/admin/inventory/:id/adjust` accepts `{version,delta,note}`: nonzero integer delta ±1,000,000, trimmed reason 3–500 characters. It returns current `{stock,version}`. Stale version or out-of-bounds final stock returns 409 with no mutation. GET `/api/admin/inventory/movements?page=1` returns 20 newest ledger records, SKU/product/variant, signed quantity, reason, order reference, note, actor and creation time.

GET `/api/admin/orders?page=1&status=CONFIRMED` accepts an optional exact status and returns 20 summaries. GET `/api/admin/orders/:id` returns the historical order snapshot and current order version. PATCH `/api/admin/orders/:id/status` accepts `{version,status}`. Legal transitions: CREATED→CONFIRMED→PROCESSING→SHIPPED→DELIVERED, or cancellation from CREATED/CONFIRMED/PROCESSING. Invalid/stale transitions return 409; same-status retries return the current record.

POST `/api/orders/:id/cancel` accepts only `{version}`, requires owned authentication/Origin/CSRF, and returns the order envelope. Non-owned orders return 404. Cancellation restores all item stocks exactly once with unique ledger entries and audit in one batch; restoration overflow or missing original movement rejects the change.

GET `/api/admin/analytics?days=7` accepts 7 or 30 and reports database counts, all-time successful gross/cancelled/net demo amounts, daily UTC net values, top products and low-stock variants. GET `/api/admin/audit?page=1` returns 20 newest actor/action/entity/request references. No password, session token or delivery metadata is exposed in audit records. See [test coverage](testing.md) for transactions, local role provisioning and evidence.

## Phase 8 hardening

Authenticated mutations now share D1 fixed-window budgets per account: profile/addresses 60/minute, cart + wishlist 120/minute, quote 20/minute, checkout attempts 20/minute, customer cancellation 12/minute and all admin writes 60/minute. The API checks role and Origin/CSRF first, rejects excess with 429 `MUTATION_RATE_LIMIT` and `Retry-After`, and returns 503 if the counter cannot be checked. Invalid same-origin inputs consume allowance. Reads remain available; after a checkout limit expires, retry the same idempotency key to recover its order. Login/register policies remain unchanged.

Admin product listing also accepts `q` (trimmed literal name/slug/SKU substring, max 100 characters/400 UTF-8 bytes), `category` (ID, max 100 characters), `archived=all|active|archived` and `stock=all|low`. Filters compose and page counts use the filtered snapshot; low stock requires an active variant at/below its threshold. Unknown/repeated/invalid filters return 400.

Analytics adds `productsSold` from successful non-cancelled item quantities, `ordersByStatus` for statuses present in the database (the UI fills missing statuses with zero), and at most five `recentOrders` with ID/number/status/total/creation time. Overview links open the corresponding order/status filter. See [test coverage](testing.md) for transaction, header, performance and audit evidence.
