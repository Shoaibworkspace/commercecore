# Security and account behavior

## Local and hosted authentication

Local accounts use PBKDF2-SHA256 with unique salts and a 600,000-iteration work factor. Local passwords support 15–128 characters with a 512-byte limit and a small common-password denylist. Local accounts do not send verification/recovery email.

Hosted production requires Supabase Auth with email confirmation and configured custom SMTP. Passwords require at least 15 characters and at most 72 UTF-8 bytes; overlong input is rejected, never truncated. Supabase's minimum password length should also be set to 15. Production never falls back to local password hashing or reduces its work factor.

The Worker pins credential requests to the configured 20-character hosted Supabase project URL, refuses redirects and applies a timeout. It uses a publishable key, never a service-role key. The provider project/subject is the stable identity; email alone cannot take over an existing account, and provider metadata cannot assign admin roles.

## Sessions and credentials

After provider verification, CommerceCore issues an opaque HttpOnly session cookie with CSRF protection. Hosted sessions expire within one hour or the shorter provider lifetime; local sessions have a 24-hour absolute lifetime and two-hour idle limit. A maximum of five active devices is retained. Production cookies use the secure `__Host-` prefix, Secure and SameSite=Lax.

Provider access/refresh tokens are not persisted in D1 or returned by login. No password/session token is placed in browser storage. React Query caches are memory-only, scoped by account ID and cleared at logout. Only the theme preference uses browser storage.

Provider-side bans/password changes outside CommerceCore do not immediately invalidate an existing app session; its remaining hosted lifetime can be up to one hour. CommerceCore's own successful recovery flow deletes all mapped application sessions. A provider password change and the D1 session deletion span two services, so they are not one cross-service transaction.

## Email confirmation and recovery

Signup requests confirmation and does not create an application session. The confirmation callback returns to `/login`; the user signs in after confirming.

Recovery uses `/forgot-password` and `/reset-password`. The recovery token is read from the URL fragment into component memory and promptly removed from the address bar. The backend validates it with the provider before changing the password. It is never stored in localStorage, query caches or application logs. Use fresh links for expired recovery requests.

Configure exact HTTPS callbacks and the canonical site URL. SMTP credentials belong only in the provider dashboard. Keep email confirmation enabled. Free email/provider quotas can temporarily block requests; do not disable protections to bypass setup errors.

Email confirmation, sign-in and explicitly authorized admin access were observed on the reference deployment. Real password-reset/new-password/sign-in acceptance remains a human step because credential entry must stay private. Integration tests cover the recovery/session-revocation path with a mocked provider.

## Request boundaries

- The server checks the current D1 user role on every protected request.
- Mutations require the exact allowed Origin and an appropriate pre-login/session CSRF token.
- D1-backed rate limits bound account, shopping, quote, order and administration mutations across requests.
- Request schemas reject unknown privilege/price/owner fields and bound body/query sizes.
- Prepared SQL binds user data; searches treat SQL-like input as literal data.
- Client-supplied roles, prices, ownership, discount amounts and totals are never authoritative.
- Uploaded/remote image URLs are not accepted; admin image choices come from bundled allowlisted assets.

## Inventory and orders

Money uses integer paise. Server quotes expire and capture current cart/address/pricing versions. Checkout validates current availability and commits the order, line snapshots, stock movements, audit record and idempotency key atomically. A failed/ignored required write rolls back the entire operation.

Cancellation is restricted by ownership and legal order state. Stock is restored once against the original movements. Version checks and concurrency tests prevent stale edits, overselling and duplicate side effects.

## Browser and operational controls

Static assets have CSP, frame protection, MIME and referrer policies. API responses use no-store and conservative security headers. Error responses/logs avoid passwords, keys, tokens, provider payloads and internal SQL.

Keep `.dev.vars`, `.env`, database exports, runtime folders and `wrangler.production.jsonc` outside Git. The candidate scan checks known credential signatures and private paths; it cannot prove arbitrary text or binary files are secret-free. Only clean storefront screenshots are committed.

There is no seeded admin/password and no public role-assignment endpoint. Register and confirm the authorized operator account, then use the explicit admin-role script described in the deployment guide. Never grant access based only on a name in a log.

## Reporting and limits

See [SECURITY.md](../SECURITY.md) for private reporting guidance. These controls and tests are not a third-party security certification. Real payments, MFA, email changes, self-service account deletion, fulfillment integrations and commercial compliance are outside this demo's current scope.
