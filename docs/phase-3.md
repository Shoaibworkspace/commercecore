# Phase 3 — Database and product APIs

The photo storefront now reads the catalog from Cloudflare D1. This phase adds a working catalog and internal product management; customer accounts, persistent carts and checkout remain subsequent phases.

## Implemented functionality

- Additive `0002_catalog.sql` migration for product metadata, category imagery and optimistic versions, variant swatches/photo paths/order, plus catalog indexes. Existing IDs, price and inventory are retained.
- Repeat-safe expanded seed with 12 products, 24 variants, gallery records and inventory seed movements. The three original products and four original variant IDs stay stable. Re-seeding does not reset edits, prices, stock or archive flags.
- Public category, list/search/filter/sort/pagination and detail/related-product APIs. Price and stock must match the same active variant. Archived/incomplete products are excluded. Totals and clamped pages use one SQL snapshot; no per-product API/database round trips.
- Shared Zod contracts and runtime frontend validation. All storefront catalog pages and category navigation use APIs with cancellation, bounded client cache freshness, loading/error/empty states and retry. No static-fixture fallback disguises database failures.
- Internal category/product/variant/image management: atomic product creation, optimistic metadata edits, archive/unarchive, bounded variants and local image paths. New variants start at zero stock; inventory writes are rejected here.
- Every `/api/admin/*` method denies access with 401. Internal management code has no HTTP route. Real session authorization and CSRF must precede exposing it.

## Files created or modified

Backend: `worker/routes/catalog.ts`, `worker/services/catalog.ts`, `catalog-management.ts`, `errors.ts`, `worker/repositories/catalog.ts`, `catalog-management.ts`, `health.ts`, `worker/validators/catalog.ts`, `catalog-management.ts`, app wiring and Phase 3 diagnostics.

Database/contracts: `db/migrations/0002_catalog.sql`, `db/seed/storefront.sql`, `scripts/create-catalog-seed.mjs`, `shared/catalog.ts`, `public/images/product-placeholder.svg`.

Frontend: catalog model/query transport, API client, Home/Shop/Product/About/Foundation, Layout, ProductCard and CatalogStates. The photographic design and welcome overlay remain intact.

Verification/docs: `tests/catalog-api.test.mjs`, `tests/helpers/sql.mjs`, phase status assertion, seed npm commands, TypeScript config, README, API/frontend/deployment/verification docs and this report.

## Run and verify

```sh
npm ci
npm run db:migrate:local
npm run db:seed:local
npm run check
npm run dev
```

Open `/shop` or `/products/studio-ceramic-cup`. API example: `/api/products?category=home&minPrice=70000&maxPrice=120000&stock=1&sort=price-asc`. API prices use paise; browser filter inputs use whole rupees. `npm run db:generate:seed` regenerates SQL from reference data without modifying a database. Apply both migrations before the original and expanded seed scripts.

## Verification results

Verified locally on **14 October 2026**:

- `npm run check`: **41 tests passed, zero failed/skipped**, frontend/Worker type checks, zero-warning lint, Vite production build and Worker deployment dry run passed. The new real-D1 integration group accounts for 19 test results (18 cases plus its enclosing test).
- `npm run format:check` passed. Local Wrangler applied the additive migration (15 statements) and both repeat-safe seed scripts (4 original + 123 expanded statements).
- Browser storefront loaded 12 products from D1. Search for `stoneware` returned two. Maximum ₹1,000 + in-stock + ascending-price filters returned Pouch ₹599, Notebook ₹699, Cup ₹799 and Bottle ₹999. Page 2 displayed the six remaining products.
- Cup Sand retained the original database's four units rather than the preview fixture's stock. Selecting Ink changed its actual photo path to `/images/photos/cup-alt.webp`, displayed out of stock, and persisted through reload via the variant URL.
- An inverted range entered directly in the URL showed the API validation message and collection-unavailable state. Clear filters recovered all 12 products; no fixture fallback masked the failure.
- Mobile keyboard menu navigation loaded four Workspace products; filter collapse worked. At 390 px and 320 px, DOM scroll width equaled client width. Temporary viewport overrides were reset. Final captured browser warning/error logs were empty.
- The homepage loaded database categories and bounded featured/new-arrival pages. The welcome screen still appeared on the fresh tab and dismissed automatically. Screenshots: `docs/phase-3-catalog.png`, `docs/phase-3-product.png`, `docs/phase-3-mobile.png`.

Measured build artifacts: main frontend JS 392.22 kB / 120.87 kB gzip; CSS 46.56 kB / 10.33 kB gzip; lazy route chunks remain separate. Worker dry-run bundle 838.05 KiB / 137.56 KiB gzip. These are file sizes, not cloud CPU or capacity results.

The first isolated integration run was blocked by the sandbox's loopback restriction; rerunning with approved local runtime access executed real D1. A literal `%` search initially had an incorrect zero-match test expectation; the fixture contains “100% cotton”, so the test was corrected to require exactly that tote. No SQL wildcard expansion was introduced.

Browser automation briefly reported a checkbox timing error, but the fresh state confirmed the checked control, correct URL and four filtered results. Native screenshots taken immediately after navigation occasionally showed the preceding frame; the retained product/mobile previews were captured after the new state rendered. No application failure was suppressed.

## Known limitations and next phase

No public deployment, Cloudflare account changes or GitHub publication was performed. Full session authentication, CSRF/abuse controls, actor audit writes and admin UI are not implemented. Management functions must never be mounted without those controls. Metadata price writes are admin-internal operations; they are not customer checkout prices.

Current search scans the relevant catalog using SQLite ASCII case folding. FTS/Unicode normalization and production row/CPU performance measurements are future work. API HTTP caching remains disabled to avoid shared stale-price behavior; short-lived client reads do not authorize checkout. Image paths reference local bundled assets; uploads and future admin asset-existence checks are pending. Curated `isNew` controls new-arrival ordering.

The database contains sample goods and stock. Inventory adjustment/ledger reconciliation, checkout atomicity under customer competition and cancellation tests are Phase 6–7 work; catalog management concurrency tests do not claim those features.

**Next: Phase 4 — Authentication and user accounts:** secure registration/login/logout, HttpOnly sessions, role/ownership authorization, CSRF, profile/addresses, and measured password hashing within the free Worker CPU budget.

Implementation references: [D1 prepared statements](https://developers.cloudflare.com/d1/worker-api/prepared-statements/) and [D1 database/batch API](https://developers.cloudflare.com/d1/worker-api/d1-database/) were checked against official documentation on 14 October 2026.
