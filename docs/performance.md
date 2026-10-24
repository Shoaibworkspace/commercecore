# Measured local performance

Measured on 21 October 2026. Raw results: [API benchmark](api-benchmark.json), [before stock-index correction](api-benchmark-before.json), [built assets](performance-assets.json).

## Conditions

Built Worker ESM in local workerd / Miniflare with isolated D1; Node v24.18.0, win32/x64, AMD Ryzen 5 3500U with Radeon Vega Mobile Gfx. Each endpoint/scenario has a first request reported separately, two warmups and 20 sequential measured requests. Fixtures start with 12 products, then add 1,000 synthetic products and 1,000 historical orders in an isolated database. The benchmark does not use the user database, create real payments or simulate public load.

The first request for an endpoint is not a separate fresh-process cold-start experiment. These are local wall times, including serialization/D1, rather than cloud Worker CPU, browser LCP, throughput or supported-user counts. Host load and small sample counts affect p95; results are evidence for this machine and fixture only.

## API results

| Scenario                      | Endpoint                                                    | p50 ms | p95 ms | Response bytes |
| ----------------------------- | ----------------------------------------------------------- | -----: | -----: | -------------: |
| Seed 12                       | `/api/health`                                               |  10.55 |  15.94 |            131 |
| Seed 12                       | `/api/products?page=1&pageSize=12`                          |  24.09 |  34.26 |          12761 |
| Seed 12                       | `/api/products?q=canvas&stock=1&sort=price-asc&pageSize=12` |  19.27 |  29.34 |           2176 |
| Seed 12                       | `/api/products/daily-canvas-tote`                           |  17.35 |  26.05 |           4325 |
| Seed 12                       | `/api/admin/analytics?days=30`                              |  24.98 |  44.69 |           2139 |
| Seed 12                       | `/api/orders?page=1`                                        |  28.15 |   57.9 |            105 |
| 1,012 products / 1,000 orders | `/api/health`                                               |   7.05 |  18.29 |            131 |
| 1,012 products / 1,000 orders | `/api/products?page=1&pageSize=12`                          |  23.23 |  40.15 |           9668 |
| 1,012 products / 1,000 orders | `/api/products?q=canvas&stock=1&sort=price-asc&pageSize=12` |  35.85 |  46.11 |           7220 |
| 1,012 products / 1,000 orders | `/api/products/daily-canvas-tote`                           |  24.37 |  36.73 |           3256 |
| 1,012 products / 1,000 orders | `/api/admin/analytics?days=30`                              |  38.96 |  65.79 |           3000 |
| 1,012 products / 1,000 orders | `/api/orders?page=1`                                        |  17.83 |  28.81 |           2091 |

The initial scaled stock/search/price-sort run measured p95 **708.65 ms**. Query planning selected an unsuitable global stock access path for product-correlated availability checks. Migration 0008 adds `(product_id, active, stock)`; the matching rerun measured p95 **46.11 ms**. Recorded EXPLAIN plans confirm `variants_product_stock` is used. This local before/after comparison does not promise the same improvement on other datasets or hardware.

Daily admin trends aggregate a bounded UTC range once before joining the 7/30-day calendar. Recent orders and customer/status pagination are bounded and indexed. Substring discovery still scans eligible catalog text, and price sorting can use a temporary sort. Large catalogs may need measured full-text/search or materialized reporting designs rather than assumptions about free capacity.

## Phase 8 artifact baseline (12-product catalog)

| Asset                              | Measured bytes | Maximum bytes |
| ---------------------------------- | -------------: | ------------: |
| Entry JS, gzip                     |          75738 |         90000 |
| All JS including lazy routes, gzip |         162183 |        250000 |
| All CSS, gzip                      |          15262 |         20000 |
| Largest WebP                       |         159438 |        300000 |
| All 25 bundled WebP photos         |        1704958 |       2500000 |

Budgets passed. Gzip uses Node defaults; bundler-displayed compressed estimates can differ. All-JS totals include route chunks that are not fetched on the initial page. Lazy routes and original WebP assets remain in place. These are artifact sizes, not complete network transfer or page-speed scores.

## 100-product catalog assets, 23 October 2026

The [catalog expansion](catalog-expansion.md) retains the API benchmark above as historical Phase 8 evidence. Its new production build passes the same JS, CSS and individual-photo budgets. Total-photo allowance is deliberately increased to 8 MB for the larger catalog; pagination and lazy loading bound the requested images per page.

| Artifact            | Measured bytes | Maximum bytes |
| ------------------- | -------------: | ------------: |
| Entry JS, gzip      |          75823 |         90000 |
| All JS, gzip        |         164412 |        250000 |
| CSS, gzip           |          15516 |         20000 |
| Largest WebP        |         159438 |        300000 |
| All 113 WebP photos |        3879054 |       8000000 |

The expanded D1 integration validates all 100 products and discounted checkout behavior. These artifact/test results do not establish hosted CPU capacity, supported traffic or public account availability.

## Cache and request behavior

Actual preview responses were checked: hashed `/assets/*` bundles use `public, max-age=31536000, immutable`; photos use `public, max-age=3600, must-revalidate`; APIs use `no-store`. Frontend catalog queries have short in-memory freshness. Admin mutations refresh affected data without refetching private account/profile/address resources. Checkout always rechecks authoritative prices and availability. Mutation counters add two bounded SQL statements per attempted authenticated write; this quota cost must be included in free-plan sizing.

## Reproduce

```sh
npm ci
npm run check
npm run perf:api
```

The full check writes the asset report; the benchmark writes the API report. Never publish the local wall-time numbers as Free-plan CPU or deployment capacity evidence. Actual Workers Free hashing and public-path latency are separate release gates.
