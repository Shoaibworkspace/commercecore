# Accounts and authentication

Local authentication continues to work with the existing accounts. Hosted authentication now uses Supabase Auth, selected by the user on 23 October 2026. Cloudflare still owns the product catalog, application users/roles, opaque sessions, addresses, carts and orders. Production activation remains gated until provider/email configuration and acceptance checks are complete.

## Hosted Supabase flow

`AUTH_PROVIDER=supabase` is mandatory in production. The Worker pins outgoing credentials to the configured 20-character hosted `https://<project>.supabase.co` origin, sends passwords only to that provider, rejects redirects and applies a 12-second timeout. It uses a publishable key, never a service-role/admin key. Existing Origin, CSRF and D1 rate limits run before provider requests. Provider outages fail closed; there is no local-password fallback.

Registration requests an email confirmation and never grants an application session. Login requires an email-confirmed provider identity, validates the issued access token with the provider's `/user` endpoint, and maps the stable project URL/subject through migration 0010. Email alone cannot link an existing account. Provider metadata cannot assign roles; new application users are customers and existing roles remain authoritative in D1. External accounts store only a non-password marker in the required legacy hash column.

CommerceCore issues its own HttpOnly cookie/CSRF session after verification. Provider access and refresh tokens are not returned to the browser, logged or retained in D1. Hosted sessions expire after at most one hour (or the provider token lifetime, if shorter); there is no silent refresh. Provider-side bans or password changes made outside CommerceCore do not instantly revoke a previously issued app session; its maximum remaining lifetime is one hour. CommerceCore recovery explicitly deletes all mapped app sessions after a successful password change.

`/forgot-password` and `/reset-password` use the provider's recovery email. The recovery access token is read from the URL fragment into component memory, immediately removed from the URL and never stored in browser storage/query caches. The server validates it with Supabase before changing the password and revoking application sessions. A normal confirmation link returns to `/login`; its fragment is discarded and the user signs in with their confirmed account. Expired links require a new recovery request.

Hosted passwords require at least 15 characters and at most **72 UTF-8 bytes**, reflecting the provider's bcrypt storage. Overlong input is rejected explicitly and never truncated. Local PBKDF2 accounts retain their original 15–128 character/512-byte limits. Configure the project's minimum password length to 15 as well: direct provider clients are outside the app's validation boundary.

Supabase's default sender is restricted to project team addresses and currently two emails/hour. Public email confirmation/recovery therefore requires custom SMTP. The user is configuring Brevo Free directly in the Supabase dashboard; SMTP credentials do not belong in this repository or chat. Keep email confirmation enabled, set the canonical site URL, and allow only the exact `/login` and `/reset-password` HTTPS callbacks. Do not disable confirmation to bypass email setup. Free projects can pause after inactivity; provider availability is part of sign-in availability. See [Supabase SMTP](https://supabase.com/docs/guides/auth/auth-smtp), [password security](https://supabase.com/docs/guides/auth/password-security), and [Free plan](https://supabase.com/pricing).

## Local setup and screens

Run `npm run db:migrate:local`, `npm run auth:setup:local`, then `npm run dev`. Setup creates one random 32-byte secret as 64 hexadecimal characters in ignored `.dev.vars`; it never prints or overwrites an existing secret. Use `/register`, `/login`, `/account`. Use sample delivery addresses and unique passwords. Hosted accounts need an email you control for confirmation; local-only accounts can use invented demo emails. The following paragraph describes local account limitations.

Registration accepts name, ASCII email and password; the email is trimmed/lowercased. Passwords accept spaces/Unicode, 15–128 JavaScript characters, at most 512 UTF-8 bytes, with a small common-password denylist. Passwords are not trimmed or truncated. The denylist is not a breach-password database. Profile editing changes the name only. Email changes, verification, password changes/recovery, MFA and self-service account deletion are not implemented. Saved addresses currently support India only, six-digit PIN and 10–15-digit phone numbers; ten addresses maximum.

The account header and menu are live session-aware links. Every profile/address action calls the backend. Query caches are memory-only, private data is keyed by user ID, and logout clears query caches. Password submissions use plain fetch rather than retaining password variables in a mutation cache. Only the theme preference uses browser storage; no credentials/session tokens are stored there. The current storefront introduces itself in place without a blocking welcome overlay.

## Historical local hashing investigation

**Hosted result, 23 October 2026:** four synthetic requests using the actual hashing module all failed with `NotSupportedError`: the deployed runtime rejected PBKDF2 counts above 100,000, including the required 600,000. Hashing did not execute, so the short failure CPU times do not measure password-hashing headroom. Sanitized evidence is in `auth-hosted-probe.json`. The isolated token-protected probe had no D1/customer access and was removed after measurement. The work factor remains unchanged locally. The historical CPU investigation below is superseded for production by the Supabase integration above.

`worker/services/crypto.ts` uses native `node:crypto` PBKDF2-HMAC-SHA256 at **600,000 iterations**, a fresh 32-byte salt, 32-byte derived key, a versioned record and constant-time comparison. Unknown users/invalid legacy hashes run the same derivation work before a generic credential failure. The pinned Worker compatibility date now explicitly opts into `nodejs_compat`. No reduced-cost test or production hashing path exists.

[OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html) prioritizes Argon2id and lists the selected PBKDF2 work factor; [Workers native crypto](https://developers.cloudflare.com/workers/runtime-apis/nodejs/crypto/) supports Node crypto while excluding Argon2. Native PBKDF2 is used for compatibility, with its CPU cost treated as an unresolved deployment constraint. [Workers Free](https://developers.cloudflare.com/workers/platform/limits/) currently has 10 ms CPU/request. Never lower the work factor to get under that quota.

`npm run auth:benchmark` executes the actual 600,000-iteration operation in Node and local workerd. `docs/auth-benchmark.json` records three samples, runtime/hardware and the distinction between wall time and CPU. Node hash wall time was approximately 211–229 ms; local Worker round trips approximately 620–3,067 ms including a cold request. These are **local wall-clock measurements**, not Cloudflare CPU measurements or proof the secure design fits Free.

Development auth is restricted to loopback request URLs; accidentally deploying `APP_ENV=development` cannot enable public auth. Production requires all of:

- `APP_ENV=production`.
- A random `AUTH_SECRET` set with `wrangler secret put AUTH_SECRET`.
- `APP_ORIGIN` equal to the exact canonical HTTPS origin, without path/trailing slash.
- `AUTH_PROVIDER=supabase` with the pinned project URL and publishable key.
- Explicit `AUTH_PUBLIC_ENABLED=verified`, after provider configuration and isolated acceptance checks. Public production local-password authentication is rejected even with this flag.

Without that configuration, account endpoints fail closed with 503; public catalog reads remain available. The 23 October hosted probe failed before hashing and prompted the user-approved Supabase integration. The separate production configuration is not used by local Wrangler development. Actual email delivery, account and checkout checks remain necessary after publishing the release candidate.

## Sessions and CSRF

Sessions use fresh 256-bit opaque random tokens. D1 stores SHA-256 token hashes and CSRF-token hashes; raw session tokens appear only in HttpOnly cookies. Production cookies use `__Host-cc_session`, `Secure`, `HttpOnly`, `SameSite=Lax`, `Path=/`, no Domain; loopback development uses a separate non-Secure name. Absolute lifetime is 24 hours; idle expiry is two hours, with activity writes at most every five minutes. Login rotates/revokes the presented session; logout revokes its database row. A user retains at most five devices. Expired-row cleanup is bounded to 100 rows per successful new session.

Anonymous session bootstrap returns a signed, expiring pre-auth CSRF token with a matching HttpOnly cookie. Login/register require that token and exact Origin. Authenticated mutations require a session-bound CSRF token in `X-CSRF-Token` and exact Origin; cross-site Fetch Metadata is rejected. CSRF tokens are returned as JSON and retained only in memory; they are not session bearer tokens. Header values alone cannot grant a role. Secret rotation invalidates old derived CSRF bindings under the new secret; operational rotation should also revoke stored sessions deliberately.

No CORS allowlist is enabled. Use one exact origin. For Vite development, explicitly configure `APP_ORIGIN` to its loopback origin as described in README, then remove that override when using the Worker URL.

## Validation, limits and ownership

JSON mutation bodies are streamed with an 8 KiB byte cap, checked MIME, strict Zod object schemas and bounded fields. Registration creates the customer user and session in one D1 batch. Database failure rolls both back. Role, ID/owner and profile email injection are rejected. Profile/address edits use optimistic versions; another user's address appears missing and cannot be edited/deleted. Default changes and address-cap enforcement are transactionally guarded; the partial unique index always permits at most one default. Deleting/unsetting the default can leave no default, which the next address creation or an explicit edit can resolve.

Login limits: eight attempts/account and forty/IP per ten-minute window. Registration: three/account and eight/IP per fifteen-minute window. Counts include successes. D1 atomic upserts coordinate isolates; keys are HMACs of purpose plus normalized email or platform IP, not raw identifiers. Development uses one `local` IP bucket so arbitrary forwarded headers cannot bypass it. IP limits are checked first to prevent blocked clients from creating unbounded email buckets. Limits return 429 and Retry-After. Expired counters are deleted in bounded batches; counters can remain until the next allowed attempt. These controls still cost D1 operations and cannot prevent quota exhaustion/distributed denial of service. Edge protections and retention monitoring remain release work.

## Administration and limitations

`GET /api/admin/status` requires a real current session and a database `admin` role. Anonymous requests get 401; customers get 403, including spoofed headers. Roles are read on every request, so demotion takes effect immediately. The Phase 7 `/admin` workspace and mutation APIs use this middleware plus CSRF checks. Local role grants/revocations require an explicit operator command; see [administration](phase-7.md). No seed or signup creates an admin.

There is no default administrator or seeded password. Explicit local operator grants may already exist; local users and roles are not uploaded to the hosted database. Provisioning a hosted administrator requires a newly registered, confirmed account and an explicit audited operator action. Use `node scripts/admin-role.mjs --remote --email registered@example.com --grant` to preview, then add `--apply` only for the authorized account. Public signup cannot assign administrator access. These controls do not claim complete application security.
