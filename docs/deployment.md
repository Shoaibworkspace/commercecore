# Environment and ₹0 deployment

## Local environment

Node 24, npm, and Wrangler are sufficient. Use `npm ci` after the lockfile is present. Local D1 lives in ignored `.wrangler/`; tests create isolated databases. Run migrations before seed; seed deliberately does not create users/admins. Copy `.dev.vars.example` to `.dev.vars` when auth secrets are added. `.env.example` explains frontend variable exposure: anything prefixed `VITE_` is public.

`wrangler.jsonc` defines `DB` (D1) and `ASSETS` (static frontend). `APP_ENV` is development until deployment configuration is set deliberately; `PAYMENT_MODE` remains demo. The all-zero database ID is a **local configuration sentinel**, never a real hosted database. `npm run deploy` rejects it.

The compatibility date is pinned to 1 August 2026, supported by the stable local Miniflare test runtime. It defines API behavior rather than the release date; advance it deliberately after checks. Dependencies are resolved in the repository lockfile.

## Provision when the release is ready

For a new checkout, first copy `wrangler.production.example.jsonc` to `wrangler.production.jsonc`. The real production file is intentionally ignored by Git. Configure your own account ID, D1 ID, provider project/publishable key and app origin; the example starts with placeholders and public auth disabled. Tests use synthetic configuration and do not require the operator's real bindings.

The reference deployment runs 100 sample products, seven categories and 220 variants on Workers/D1. Hosted email confirmation, owner sign-in and explicitly assigned admin access have been verified. Provider recovery is implemented with isolated integration coverage; a real password reset remains a manual acceptance step. Existing users, sessions, orders and addresses stay in their own database, outside source control.

Run `npm run deploy:preflight` for a read-only configuration report. It reads no secrets, changes no database and creates no hosted resources. A nonzero exit reports missing configuration; even a passing report still requires the listed account, CPU and live acceptance checks. The existing deployment guard remains enforced.

The hosted demo must retain `PAYMENT_MODE=demo`. Seed only the three sample catalog files below into the new hosted database; do not upload the local database, registered users, password hashes, sessions, orders or `.dev.vars`. A hosted administrator must be registered and explicitly promoted separately after authentication release checks pass.

1. Create a Cloudflare account on the Free plan. Do not enroll in Workers Paid, add paid storage, or enable paid runners. Verify eligibility and current limits in your dashboard. No credit card, payment gateway or custom domain is required by this project's selected services.
2. Authenticate locally:

```sh
npx wrangler login
npx wrangler whoami
npx wrangler d1 create commercecore-db
```

3. Copy the **actual** `database_id` printed by the create command into `wrangler.production.jsonc`. Keep `APP_ENV` as `production`. Do not publish development secrets. Hosted CLI commands must use `--config wrangler.production.jsonc`; local commands retain the default configuration.
4. In Workers & Pages, configure the free account subdomain. With `workers_dev: true`, deployment yields `https://commercecore.<your-account-subdomain>.workers.dev`. This is an example URL, not a verified live deployment.
5. Apply migrations and, if desired, the demonstration sample catalog:

```sh
npm run db:migrate:remote
npx wrangler d1 execute commercecore-db --remote --config wrangler.production.jsonc --file db/seed/catalog.sql
npx wrangler d1 execute commercecore-db --remote --config wrangler.production.jsonc --file db/seed/storefront.sql
npx wrangler d1 execute commercecore-db --remote --config wrangler.production.jsonc --file db/seed/expanded.sql
```

Review migrations first, take an export before later schema changes, and never run destructive reset scripts on a hosted database.
Apply all numbered migrations, including 0009 for comparison prices, before seeding. `catalog.sql` is the retained initial seed; `storefront.sql` retains the original 12-product catalog; `expanded.sql` adds the mixed catalog to reach 100 sample products. Each preserves existing IDs, prices, inventory and edits. Run `npm run db:generate:seed` after deliberate sample-fixture changes; generating SQL does not write a database. Do not use seed reruns to reset stock. See [catalog expansion](catalog-expansion.md) for assets and preservation checks.

6. For local accounts run `npm run auth:setup:local` and restart Wrangler. For production, initialize a separate random signing secret privately with `node scripts/initialize-hosted-auth.mjs` (preserves an existing secret), or `npx wrangler secret put AUTH_SECRET --config wrangler.production.jsonc`. Never put secrets into tracked files, logs, frontend bundles or shell arguments. Set `APP_ORIGIN` to the exact canonical HTTPS origin. Configure `AUTH_PROVIDER=supabase`, the project URL and **publishable** key. Leave `AUTH_PUBLIC_ENABLED=disabled` until the provider configuration and isolated authentication tests pass. Require email confirmation and configured custom SMTP, then deliberately set `AUTH_PUBLIC_ENABLED=verified` to publish a release candidate. Complete actual confirmation-email delivery, sign-in, recovery and checkout acceptance before calling the hosted demo ready. Never restore local password hashing on the hosted runtime or reduce its work factor. See [accounts](accounts.md).
7. Run `npm run deploy` after full release acceptance. Do not confuse `worker:check` with publication: it is a dry run.
8. Verify live `/api/health` and `/api/ready`; then perform register/login/logout, filters, persistent cart/wishlist, demo order, stock decrement, idempotent retry, order ownership denial, and non-admin denial. Record actual URL and results in verification documentation.

## GitHub and CI/CD

The repository has no GitHub remote yet. Create a public portfolio repository and push this project. `.github/workflows/ci.yml` runs the full checks on pushes and PRs using standard Linux runners; keep the repo public for the zero-cost Actions path. Never enable paid larger runners automatically.

CI is implemented in Phase 1. Automated deployment is intentionally deferred to Phase 9: add a manual `workflow_dispatch` job in a protected GitHub environment, depend on successful checks, and store a least-privilege Cloudflare API token/account ID as GitHub secrets. Provision the database explicitly before deploying. Do not run production migrations from arbitrary unreviewed PRs or fork builds. Cloudflare's [GitHub Actions deployment guide](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/) should be rechecked when this job is implemented.

## Limits and availability

See the dated official quota references in README. Stay Free: quota exhaustion should cause unavailability, never an automatic paid upgrade. Watch database row metrics and Worker CPU; indexed queries still consume quota. Trim expired sessions and bounded abuse records in later phases; define order/audit retention and backup/export policy before launch.

Cloudflare [documents workers.dev](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/) as suitable for personal/hobby use and recommends routes/custom domains for business-critical production. This application is a production-style portfolio demo; it does not provide a business-critical uptime guarantee, real payment settlement, or unlimited storage/traffic. Free-plan terms may change; recheck before launch.

## Phase 8 verification before provisioning

Use the committed lockfile with `npm ci`. Scoped Miniflare 4 dependency overrides select patched sharp/undici while retaining the stable simulator line. `npm run check` includes all tests and asset budgets; CI also checks formatting and npm high-severity advisories. Migrations 0007/0008 add five supporting indexes without changing business rows. Apply every migration in order. Local benchmarks and dry-runs do not verify public CPU/quotas. Review the remaining authentication/email/retention gates in [Phase 8](phase-8.md) before enabling public accounts.
