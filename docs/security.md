# Security decisions and release gates

## Implemented in Phase 1

Foreign keys, STRICT columns and CHECK/UNIQUE constraints; prepared health query; safe JSON error envelopes; internally generated request IDs; no SQL/provider error disclosure; no-store API responses; baseline security headers for API and static assets; no seed credentials; ignored local secret files; demo-only payment column constraints; guarded deployment config.

These controls do not constitute a secure finished application. Phase 4 now implements local authentication and profile/address mutation APIs with session, CSRF/origin and ownership enforcement; see [accounts](accounts.md). Public authentication is disabled pending actual Free CPU evidence and deliberate release configuration.

## Implemented in Phase 4

Native PBKDF2-HMAC-SHA256 at 600,000 iterations with fresh salts; constant-time comparison; HttpOnly opaque session cookies and hashed D1 token storage; signed pre-auth CSRF, session-bound CSRF and exact Origin checks; 24-hour absolute/two-hour idle expiry; session rotation/revocation/device cap; database-backed pseudonymous rate counters checked IP-first; streamed JSON byte limits and strict schemas; scoped profile/address writes and optimistic versions; database-role admin denial and immediate demotion. Profile/address query data stays in memory and is cleared on logout. No role is accepted from customer input.

Local workerd hashing was exercised at the full work factor. It is not proof the Workers Free 10 ms CPU budget is met. Public-origin development mode is rejected; production auth requires an exact HTTPS origin, secret and explicit post-verification enablement. Email ownership/recovery, MFA, breach-password screening, retention/operational audit and live performance checks remain unresolved release decisions. No default administrator or password exists.

## Required before public customer accounts

- Hash passwords using a strong, versioned algorithm and random salts. Measure the chosen approach on actual Workers Free before enabling signup/login. [OWASP password guidance](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html) prioritizes Argon2id; PBKDF2-HMAC-SHA256 with an appropriate work factor is a potential Web Crypto alternative. Never reduce work factors simply to fit CPU quotas. Local elapsed time does not prove cloud CPU feasibility. If the secure design cannot fit ₹0, explicitly evaluate a free external identity service against the requested session model and document the trade-off before switching.
- Use opaque random session tokens in `HttpOnly; Secure; SameSite=Lax; Path=/` cookies (prefer `__Host-` in production). Store SHA-256 token hashes only in D1; use expiry, rotation and revocation. Never browser-store passwords/session tokens.
- Protect all mutations with exact-origin checks and a session-bound CSRF token. SameSite is additional protection, not the sole control. Limit accepted body size, MIME type, string sizes, cart length and pagination.
- Login/register abuse limits must be shared across Worker isolates. In-memory maps are insufficient. Investigate a Free-supported binding or bounded D1 counters, with per-IP/account limits and generic authentication errors; never log raw IPs/passwords/tokens unnecessarily.
- Enforce customer ownership and admin role in every backend route; never accept role from registration/profile payloads. Admin provisioning uses an audited explicit operation, with no public default admin/password.
- Treat React text rendering as escaping; do not render untrusted HTML. Restrict product image paths/protocols and document provenance. Configure CSP based on actual dependencies and verify browser behavior.
- Retain only necessary address/profile data. Publish demo-only notices and account retention/recovery limitations. Email verification, password recovery, MFA, and operational monitoring remain unresolved release decisions.

## Implemented in Phase 5

Wishlist APIs enforce authenticated ownership, exact Origin/session CSRF, strict bounded bodies, prepared identifiers and a 50-product cap. Save/remove operations are idempotent. Wishlist transfer uses a single D1 batch with atomic stock/activity/cumulative-quantity/cart-cap/ownership guards. Favorite deletion is conditional on the preceding outer cart write changing one row; version-trigger writes do not change that outer SQLite `changes()` result. Injected deletion failures roll back cart quantities and versions. Concurrent duplicate moves have one winner. No stock is reserved/decremented by these operations. Customer caches are user-scoped; login account changes and logout clear them. These controls remain subject to the existing public-auth release gate.

## Implemented in Phase 6

Checkout accepts only an owned saved address/cart version for quotes, then an owned quote ID, demo outcome and a bounded request key for ordering. No client price, tax, shipping, total, owner or payment credentials are accepted. Quotes are stored server-side, expire in ten minutes and retain at most five unused snapshots per account. Primary-started D1 sessions provide consistent recovery reads. A database trigger revalidates cart/address versions, quoted prices/metadata, ownership and stock inside the write transaction. Trigger row-count guards reject silent skips; items, inventory, ledger, cart clearing, request key and audit insertion roll back together. Unique quote/key constraints protect concurrent retries. Orders and snapshots remain owner-scoped. A simulated decline creates no order or inventory/cart changes. See [Phase 6 evidence](phase-6.md).

## Integrity requirements

The persistent cart is session-owned with CSRF/origin protection, strict JSON bodies, prepared SQL and server-derived integer-paise totals. Atomic SQL guards enforce cumulative quantity, stock and distinct-line limits. Version checks prevent stale absolute updates/removals; version triggers cover all cart-line writes. No cart operation changes inventory. Current-price/availability reads identify invalid saved lines. These controls do not implement checkout transactions or inventory reservation. Cart query caches are scoped to user IDs and cleared with the existing logout flow.

Transaction failures must roll back the entire checkout. Conditional SQL updates cannot silently succeed with zero changed rows. Idempotency and cancellation need database constraints plus transaction guards. Cross-row price/snapshot/stock relationships require service/trigger logic beyond the initial schema. SQL status membership constraints alone do not enforce legal transitions.

## Testing and operations

Add unauthorized admin/customer-order attempts, privilege escalation, invalid JSON, SQL-like search input, CSRF/origin rejection, login limits, session expiry, and concurrency tests before release. Never label the project completely secure; document residual risks and actual tested controls. Dependencies must be audited and reviewed during Phase 8; a build passing is not a vulnerability assessment.

## Implemented in Phase 7

Every admin route requires a current database admin role, with Origin and session CSRF for mutations. No role, owner, stock or actor field can be injected into catalog metadata. Images are restricted to the bundled asset allowlist. Optimistic versions guard edits, stock and order transitions; bounded pages and strict query/body limits apply. Admin audit records and their mutations share a D1 batch. Required-write guards abort on silently ignored writes. Cancellation verifies the original ORDER ledger, restores all item stocks once, writes unique cancellation movements and updates status/version atomically. Repeated cancellation is idempotent. Shipped and terminal orders cannot cancel. Local role changes are audited by a database trigger; no public role-assignment API or default admin credential exists. The operator helper defaults to a preview, accepts an explicit registered email and cannot target remote D1. See [Phase 7](phase-7.md) for evidence and remaining deployment/hardening limits.

## Implemented in Phase 8

Account-scoped HMAC/D1 mutation budgets run after authorization and CSRF, with saturating counters, expiry, bounded cleanup, 429/Retry-After and fail-closed 503 behavior. Checkout now asserts order/key/audit insert counts; address/default writes use batch assertions too. Static CSP blocks inline script attributes and plugins; API/asset CORP and permissions policies apply, and HTTPS responses include HSTS. Public APIs retain no-store and have no permissive CORS.

The complete executable suite and dependency audit are recorded in [Phase 8](phase-8.md). Targeted browser checks cover labels, image alternatives, duplicate IDs, landmarks, keyboard focus, menu dismissal and narrow layouts. Bundle/photo budgets run in CI. These are tested controls rather than a complete security/WCAG certification. API writes incur counter overhead; application limits do not replace platform/network protections or retention decisions. Admin discovery and analytics stay role-protected and database-driven.
