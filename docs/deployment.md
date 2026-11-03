# Development and deployment

## One application, two source folders

`frontend/` contains the React app and public assets. `backend/` contains the Worker API and database files. One root dependency install and configuration set build both. Vite emits root `dist/`; Wrangler serves those assets and the same-origin `/api/*` API.

## Local setup

Use Node.js 24 and run the commands from the repository root:

```sh
npm ci
npm run db:migrate:local
npm run db:seed:local
npm run auth:setup:local
npm run dev
```

Migrations live in `backend/db/migrations/`. Seeds live in `backend/db/seed/`. Seeding never creates users/admins or resets existing orders, credentials or stock edits. Local D1 and runtime state stay in ignored `.wrangler/`.

The signing-secret setup writes a random value into ignored `.dev.vars` without printing or replacing an existing secret. Local accounts work without an email provider. Use sample account/delivery data.

For hot reload, set `APP_ORIGIN=http://127.0.0.1:5173` in `.dev.vars`, run `npm run dev:api` and `npm run dev:web`, then open that exact origin. Remove the override for same-origin 8787 development.

## Configure your own hosted demo

1. Copy `wrangler.production.example.jsonc` to `wrangler.production.jsonc`. The real file is intentionally ignored by Git.
2. Use your own Cloudflare account and create a D1 database:

```sh
npx wrangler login
npx wrangler whoami
npx wrangler d1 create commercecore-db
```

3. Put your account ID and actual D1 ID in the ignored production config. Keep `main=backend/src/index.ts`, migrations at `backend/db/migrations`, assets at `./dist` and `PAYMENT_MODE=demo`.
4. Configure your own hosted Supabase project, publishable key, canonical HTTPS app origin and confirmation email delivery (the signed Brevo HTTPS hook below, or custom SMTP). The provider must require confirmation and a minimum 15-character password. Allow only the exact `/login` and `/reset-password` HTTPS callbacks. Store SMTP keys only in its dashboard when using that fallback.
5. Initialize a separate production signing secret privately:

```sh
node scripts/initialize-hosted-auth.mjs
```

Alternatively use `npx wrangler secret put AUTH_SECRET --config wrangler.production.jsonc`. Never place a real secret in tracked files, shell arguments, logs or frontend variables.

6. Apply migrations and sample catalog to the intended new hosted database:

```sh
npm run db:migrate:remote
npx wrangler d1 execute commercecore-db --remote --config wrangler.production.jsonc --file backend/db/seed/catalog.sql
npx wrangler d1 execute commercecore-db --remote --config wrangler.production.jsonc --file backend/db/seed/storefront.sql
npx wrangler d1 execute commercecore-db --remote --config wrangler.production.jsonc --file backend/db/seed/expanded.sql
```

Do not upload local users, sessions, password hashes, addresses, orders, database files or `.dev.vars`.

7. Keep `AUTH_PUBLIC_ENABLED=disabled` until provider configuration is verified. Set it deliberately to `verified` for release checks, then run:

```sh
npm run deploy:preflight
npm run check
npm run format:check
npm run repo:check
npm run deploy
npm run verify:hosted
```

The preflight is read-only. The deploy command enforces a guard, full checks and the explicit production config. Placeholder IDs, invalid origins, unconfigured auth and real payments are blocked. The compatibility date is pinned; change it only after runtime tests.

## Brevo HTTPS email using the existing services

Supabase Auth can call the existing Cloudflare Worker at `https://YOUR-STORE/api/hooks/auth-email`; the Worker forwards transactional email to the existing Brevo account over HTTPS. No additional hosting service, provider account or newly generated provider API key is required when an existing authorized Brevo key is available.

1. Apply migration `0011_auth_email_delivery.sql` after the tests pass. It adds a delivery ledger and does not change existing customer/order data.
2. Set `AUTH_EMAIL_PROVIDER=brevo` and `AUTH_EMAIL_FROM` to the existing verified sender in the private production config.
3. Put the existing authorized `BREVO_API_KEY` and a separate random 32-byte-base64 `AUTH_EMAIL_HOOK_SECRET` into Wrangler secrets. The hook secret uses `v1,whsec_<base64>` format. Never commit/copy either value into chat or frontend config. Sharing an existing key between applications means future revocation affects both; coordinate rotation.
4. Deploy and confirm that an unsigned POST to the hook returns 401. No unsigned caller can send email. Keep SMTP active until the relay is configured and verified.
5. In this Supabase project's Authentication → Auth Hooks, configure **Send Email** as HTTPS, enter the exact Worker URL and the matching signing secret, and enable/save it. Keep the Email Provider enabled. Hook activation handles email instead of SMTP; existing SMTP configuration remains available for rollback.
6. Verify a real signup, confirmation, sign-in and password-recovery email with a user-owned inbox. The user privately enters all passwords and codes. Inspect delivery status without reading or publishing email tokens.

The relay targets Supabase's five-second HTTP-hook budget with at most two 1.5-second Brevo attempts. Missing keys, rejected signatures, invalid input, provider rejection and database failures fail closed. Roll back by disabling Send Email Hook in Supabase; the original SMTP path then resumes with its existing settings.

Run `npm run auth:check:hosted` before a demonstration to check the existing storefront, D1 and Supabase health endpoints. This is a read-only manual diagnostic, not an email-delivery or login acceptance test and not a scheduled keepalive.

HTTPS email fixes the SMTP source-IP failure. It does **not** prevent Supabase Free projects being paused for low activity. Use the owner's provider pause notices and dashboard status for operations; a no-pause SLA or paid upgrade is not created by this change.

Sources: [Supabase Auth Hooks](https://supabase.com/docs/guides/auth/auth-hooks), [Send Email Hook](https://supabase.com/docs/guides/auth/auth-hooks/send-email-hook), [Brevo transactional API](https://developers.brevo.com/reference/send-transac-email), [Brevo idempotency](https://developers.brevo.com/docs/heterogenous-versions-batch-emails).

## Administrator setup

There is no shared administrator account. After the authorized person registers, confirms and signs in, preview their exact account:

```sh
node scripts/admin-role.mjs --remote --email registered@example.com --grant
```

Add `--apply` only for the explicitly authorized account. Omitting `--remote` targets the local database. This script changes an existing account's role; it never creates one. Admin role changes are audited.

## GitHub workflow

GitHub Actions runs installation, advisory checks, source hygiene, type/lint/integration tests, production build, asset budgets and formatting. It uses synthetic configurations and isolated databases, with no production credentials. It does not automatically deploy.

`npm run repo:prepare` exports only Git upload candidates into a new ignored output folder with a separate hash manifest. Review the result before publishing. Production bindings, private captures, databases and secrets must remain excluded.

## Hosting limitations and acceptance

The reference demo uses Cloudflare Workers/D1, Supabase Auth and Brevo email on free plans. The signed HTTPS hook is the supported alternative to source-IP-dependent SMTP delivery. Provider quotas, free-plan eligibility, inactive-project pauses and service availability are operational limits; check the current provider dashboards/docs before choosing limits or making capacity promises. A local benchmark is not a production capacity guarantee.

Verify actual confirmation delivery/sign-in, admin access, cart/order behavior and recovery separately from anonymous probes. Real payment settlement, shipping, returns, legal policies and commercial uptime are outside this demonstration.
