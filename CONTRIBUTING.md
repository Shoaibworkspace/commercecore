# Working on CommerceCore

Use Node.js 24 and `npm ci`. Follow the local setup in the README; tests use isolated databases and must never target hosted customer data.

Before a change is ready, run `npm run check`, `npm run format:check`, `npm run repo:check` and `npm audit --audit-level=high`. Explain the user-facing behavior, relevant validation and any remaining limitation in your pull request. Use focused regression tests for ownership, authentication, prices, stock and transactional behavior; visual changes need browser review at narrow and wide widths.

Keep prices in integer paise, database writes versioned, and related inventory/audit effects atomic. Never trust browser-supplied prices, ownership or roles. Preserve Origin/CSRF enforcement and explicit demo-only payments. Do not seed credentials, grant roles from signup, upload local databases or commit secrets.

Production deployment is an explicit operator action. Copy the example config to the ignored production config for your own account; CI does not publish changes. Do not use a pull request to deploy to somebody else's cloud account.

Product photography is AI-generated and illustrative. Keep that disclosure. Do not introduce unsupported review, shipping, availability or security claims.
