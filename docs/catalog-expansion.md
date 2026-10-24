# 100-product mixed catalog

Requested on 21 October 2026: expand to 100 total products with clothing, electronics, everyday jewellery, footwear, home goods and accessories, including discounts. This extends the local application; the public deployment gates remain in the roadmap.

| Category    | Products |
| ----------- | -------: |
| Clothing    |       24 |
| Electronics |       20 |
| Jewellery   |       16 |
| Footwear    |        8 |
| Home        |       14 |
| Everyday    |       14 |
| Workspace   |        4 |
| **Total**   |  **100** |

The original 12 products/24 variants remain intact. The additive expansion supplies 88 distinct products, 196 new variants, gallery records and matching initial SEED inventory movements. The resulting catalog has 220 variants. Clothing uses S–XL, footwear UK 5–9 and two ring styles sizes 6–8. These are demonstration goods and sizing/specifications, not verified physical inventory.

## Sale prices

61 new products have illustrative sale prices. `price_minor` remains the actual selling price used for filtering, sorting, cart reads, checkout quotes and historical order snapshots. Migration 0009 adds nullable `compare_at_minor`; a database constraint and shared admin validation require a positive integer comparison price strictly above the selling price. Leaving the original-price field blank removes the comparison price. Percentage labels round down and do not overstate savings. There are no invented timers, reviews or coupon claims.

Cards and product/wishlist pages show the selling price beside a crossed-out comparison price. The homepage has a bounded offers section, and `/shop?sale=1` combines sale, category, stock, price and search filters on the server. Stock/price/sale conditions must match the same active variant. Admin editors can maintain both prices with existing version checks and atomic audit records. Price edits never change stock.

Sized goods link to size selection from the price area. Product pages retain Add to cart directly below the selected variant's price; cart/order item labels preserve that selected size. Other cards retain quick Add to cart below the price. Shop pages request twelve products per page. Mobile filters start collapsed so the expanded category list does not push products below the first screen; desktop filters start open. Size controls have a minimum 44 px touch target.

## Original photographs

Built-in **imagegen** mode was used, without a paid API runner or third-party stock-photo service. Each new product has its own separately generated photograph, optimized to 640 × 640 WebP with Sharp. The existing 25 photographs are retained. Final project assets live in `public/images/photos/`; no deployed reference points to the local generated-image masters.

The full final prompt set and per-file dimensions/byte sizes are recorded in [expanded-provenance.json](../public/images/photos/expanded-provenance.json). The generation specification is [expanded-catalog-data.mjs](../scripts/expanded-catalog-data.mjs). Each prompt requests the specific unbranded item on a neutral studio background, realistic materials, full product framing, and no logos/people/watermarks. Product descriptions and imagery identify demonstration goods.

Total-photo budget is deliberately increased from 2.5 MB for the former 12-product catalog to 8 MB for 100 products. The 300 KB per-photo limit and JavaScript/CSS budgets stay fixed. Listing pagination and lazy loading bound the images requested for a page; the total library size is not its initial download size.

## Reproduction and preservation

```sh
npm run db:generate:seed
npm run db:migrate:local
npm run db:seed:local
npm run check
npm run format:check
```

`expanded.sql` requires all numbered migrations plus the original `catalog.sql` and retained `storefront.sql`. All three seeds use stable IDs and conflict-ignore inserts; reruns retain existing metadata, price, stock, archive state and gallery edits. `public/catalog.json` contains 100 validated reference products; runtime reads remain D1-backed. Historical integration fixtures retain the original 12-product seed so their filter/ownership/transaction assertions remain meaningful; a separate expanded-catalog suite covers all 100 products.

`scripts/catalog-snapshot.mjs --capture` saves an ignored local pre-import snapshot of existing product/variant fields, order summaries and user roles; `--verify` checks those exact existing records afterwards without reading credentials. Generation working records and PNG masters are local-only; deployment needs only the optimized bundled images and generated seed files. `scripts/prepare-expanded-photos.mjs` converts the locally generated masters and refreshes the bundled-image allowlist; `--partial` is a development convenience, never release verification.

## Verification

The expanded D1 integration verifies disjoint pagination across 100 products, all category totals, literal search, combined sale/price/stock predicates, invalid comparison prices, repeat-safe imports, valid foreign keys and retained legacy IDs. It also places an isolated clothing/electronics order and checks the chosen size, selling-price totals, idempotent retry, cart clearing and stable historical prices after a later catalog edit. Main-database orders are not used for destructive QA.

Concurrent checkout requests using the same key resolve to the same committed order even when one request first observes no idempotency key and subsequently observes a consumed quote. The service rechecks the key at that boundary before reporting a quote conflict. The expanded integration test deterministically pauses the first real D1 lookup until the winning transaction commits, then verifies the delayed request returns that same order as a replay. The quote-retention fixture gives its historical quote a distinct age so second-resolution timestamps and random UUID ties do not make its assertion nondeterministic.

Browser QA on the isolated preview verified 24 clothing products and 16 jewellery products, selected size L surviving the product URL and sign-in return path, readable selling/comparison prices, and Add to cart directly below the selected price. The jewellery sale filter returned 11 products. At 390 px and 320 px viewport overrides there were no broken jewellery images or horizontal page overflow; the 320 px viewport had 305 px content width after its scrollbar. Clothing size buttons measured 44 px high, selected price remained prominent, and the original viewport was restored afterwards. [Mobile verification screenshot](catalog-mobile.png).

Local import and preservation verification completed on 23 October 2026. The main database contains 100 products, seven categories, 220 variants and 61 discounted products. The saved pre-import snapshot confirms all original product/variant fields, prices, stock values, order summaries and user roles are unchanged. No existing order was cancelled or placed for browser QA.

All 88 new photographs are generated and optimized, with no missing assets. The complete 113-photo library is 3,879,054 bytes (about 3.70 MiB), including the retained original photographs and hero. These files are separate from database records. The exact final prompt set and output metadata are in the linked provenance manifest.

`npm run check` passed on 23 October 2026: **191 tests passed, zero failures or skips**, plus TypeScript, lint, the production frontend build, asset budgets and the Worker deployment dry-run. The deterministic concurrent-checkout regression also passed. Formatting verification passed. Artifact measurements: entry JS gzip 75,823 bytes, all JS gzip 164,412 bytes, CSS gzip 15,516 bytes; largest photo 159,438 bytes. No public deployment was performed.

The rebuilt main preview at `http://localhost:8787/shop` shows 100 products, twelve cards on page one and nine pages. Final browser inspection found zero broken loaded images, no horizontal page overflow and no console errors/warnings. Comparison prices, sale badges, size-selection links and quick Add to cart controls are visible beside/below prices. [Main preview screenshot](catalog-100-products.png). The local preview remains running for review; isolated QA servers were stopped.
