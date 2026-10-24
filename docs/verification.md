# Verification and performance evidence

## Commands

`npm run check`: two TypeScript projects, ESLint, executable Node tests, Vite production build, Wrangler Worker dry-run bundle. `npm run db:migrate:local` and `npm run db:seed:local`: deployment-compatible local D1 path. `npm run dev`: same-origin local serving.

The schema suite uses actual Node SQLite to validate all 16 requested tables, foreign keys, seed repeatability, money/stock checks, cart constraints, role constraints, transaction rollback, and demo order constraints. API tests exercise Hono in-process; the D1 integration test uses Miniflare's real local D1 binding and verifies failed batch rollback.

No mocks stand in for D1 in the transaction tests. The readiness error test deliberately uses a throwing binding to verify safe error handling. The original foundation tests do not validate customer checkout; Phase 4 now adds authentication/account integration tests with real D1, strong work factors, cookie/CSRF/role/ownership checks and failure injection.

## Evidence

Actual results are recorded in `docs/phase-1.md`, `docs/phase-2.md` and `docs/phase-3.md`. Phase 3 adds isolated real-D1 integration tests for schema upgrade, repeat-safe seed, catalog contracts/filters/pagination, literal malicious inputs, disabled admin routes, safe database failures, atomic management creation and concurrent version conflicts. The existing nine fixture/reference tests remain useful for currency/filter behavior; runtime storefront data now comes from D1. No cloud throughput, user-capacity, latency SLA or live availability is claimed.

Phase 4 results and residual release gates are in `docs/phase-4.md` and `docs/accounts.md`. `npm run auth:benchmark` executes native hashing in Node and local workerd at the full 600,000-iteration work factor. `docs/auth-benchmark.json` contains local wall times, not Cloudflare CPU results. Public account enablement remains blocked until actual Free-plan evidence is reviewed.

Phase 8 performance measurement must record hardware/runtime, dataset size, cache state, concurrency, request counts, CPU, p50/p95/p99 latency and failures. Cloud password-hash CPU and D1 query row metrics require live measurement. A local benchmark cannot establish free-cloud capacity. There are no fabricated benchmark values in this repository.
