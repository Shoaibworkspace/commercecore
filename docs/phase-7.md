# Phase 7 — Administration and order lifecycle

Implemented locally: protected `/admin` workspace with Overview, Catalog, Categories, Inventory, Orders and Audit sections. No dependency, upload service, payment gateway or email provider was added. Cart buttons remain directly below product prices.

## Working behavior

- Catalog: create/edit products and categories, archive/restore products, add/edit up to 20 variants, change SKU/price/activity/colour/size, and replace/append gallery photos. Image choices are existing bundled assets; the API rejects unknown or remote paths. New variants start with zero stock.
- Inventory: select a product, record signed stock changes with a required reason, and browse the paginated movement ledger. Adjustments check the current variant version and stock bounds 0–1,000,000. Each adjustment records actor and audit context.
- Orders: paginated status filtering, historical item/address/price snapshots, legal next fulfillment steps and explicit cancellation confirmation. Customer receipts also allow cancellation before shipping and display current status after reload.
- Analytics: actual database counts and simulated order value, 7/30-day UTC series with an accessible daily-values list, top five products and ten low-stock variants. Gross value includes successful cancelled orders; net excludes cancellations. These are demo amounts, not real revenue. All-time top products use item value before shipping/tax and group historical product names.
- Audit: paginated actor/action/entity/request references. Passwords, session tokens and delivery snapshots are excluded from audit metadata.

## Atomicity and access

Migration `0006_administration.sql` adds order versions, movement expected versions, five triggers and two indexes; application table count remains 17. Readiness requires the new columns and all administration triggers.

Order states are `CREATED → CONFIRMED → PROCESSING → SHIPPED → DELIVERED`; only the first three can cancel. CANCELLED and DELIVERED are terminal. Fulfillment requires simulated payment success. The version-checked order update and audit share a primary-started D1 batch. A cancellation trigger checks each original ORDER movement, restores every item, increments variant versions and writes a unique CANCELLATION movement. Item-count guards abort partial or silently skipped writes. Status, stock, ledger and audit roll back together. A repeated cancellation returns the existing order without new effects. Stock overflow prevents cancellation and leaves the order intact.

Inventory adjustments are ledger-driven: a BEFORE trigger validates version and bounds; an AFTER trigger performs and checks the stock update. Catalog writes, adjustments and order transitions include audit records in the same D1 batch. Explicit required-write checks also abort batches when an audit/mutation is silently ignored. SQLite's lazy CASE evaluation and JSON validation supply the batch assertion without another table or a JavaScript transaction callback.

Every `/api/admin/*` handler requires the current database admin role; customer headers cannot assign privileges. Every mutation also checks exact Origin and session CSRF. Customer cancellation is owner-scoped and returns 404 for another customer's order. Strict request schemas reject trusted-owner/actor/price/stock injection. Catalog bodies are bounded to 32 KiB where necessary; ordinary mutations retain the 8 KiB limit. Pages are bounded to 20 records and 1–9999. Categories show up to 100 records.

## Local administrator setup

Signup and seeds never grant admin or install a default admin password. The operator helper can only target local D1 and defaults to a read-only preview:

```sh
node scripts/admin-role.mjs --email registered@example.com --grant
node scripts/admin-role.mjs --email registered@example.com --grant --apply
```

Use the exact already-registered email. Applying changes an existing account only; it never creates an account or password. Replace `--grant` with `--revoke` to demote. A database trigger records old/new role with a local-operator reference. The normal session flow rereads the role; refresh My account and choose **Shop administration**, or open `/admin`.

## Validation and evidence

`npm run check` passed **164 tests**, zero failures/skips, TypeScript, zero-warning lint, Vite build and Worker dry-run. The new administration suite accounts for 27 results. It covers anonymous/customer/forged-role denial, immediate role demotion, CSRF/Origin, strict inputs, images/query bounds, catalog versions and audit rollback, stock bounds/concurrent saves, ledger/audit/skipped-stock failure injection, owner cancellation, concurrent/repeated cancellation, fulfillment transitions, cancellation versus shipping, multi-line restoration, missing original movements, restoration overflow and silently ignored audit/cancellation writes. Analytics are compared with direct SQL totals; daily UTC points and bounded pages are checked.

The main local migration applied successfully (10 commands), retaining existing accounts, carts and orders. After explicit user selection, the newly registered account was granted the local admin role with the operator helper. Its role audit and normal signed-in dashboard access were verified. The user entered their own password; it was not read or entered by the agent. Browser QA used separate `.wrangler/admin-qa` persistence on port 8788 with disposable accounts and fictional orders; no real cart/order was used for cancellation tests. Browser evidence includes category/product creation, eight-unit receipt, ledger/audit entries, processing/shipping, admin cancellation, customer access denial, customer cancellation and reload, plus 390/320px dashboard and 320px receipt checks without page overflow. Screenshots are saved beside this report. Captured browser errors/warnings were empty after the flows.

Screenshots: `phase-7-dashboard.png`, `phase-7-mobile.png`, `phase-7-fulfillment.png`, `phase-7-cancellation.png`, `phase-7-access-denied.png`, `phase-7-customer-cancel.png`. The QA screenshots contain fictional data only. Dashboard values differ as cancellation fixtures are exercised. `phase-7-your-admin.png` separately records the selected account's working normal local dashboard, without displaying its email or password.

## Limits and next phase

Local demo only. Fulfillment states do not dispatch parcels; cancellation does not issue a real refund. No public deployment or new hosting bill was created. Secure password hashing still needs actual Workers Free CPU evidence before public authentication can be enabled. Database concurrency correctness does not establish cloud capacity. Retention, abuse controls for administration/checkout, operational monitoring, broader accessibility and performance checks remain **Phase 8 — Hardening**. Requested email verification remains a later account-hardening task before public usage; no verification emails are sent yet.
