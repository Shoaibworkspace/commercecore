# Security policy

CommerceCore is a demo application. Do not use real payment credentials or sensitive delivery information in it.

For a suspected vulnerability, contact the repository owner privately or use GitHub's private vulnerability reporting feature when enabled. Do not post credentials, access/recovery tokens, customer information, exploitable production requests or database exports in a public issue. A public issue can describe a non-sensitive problem without those details.

The repository contains no default administrator or shared account. Production config and secrets are local/operator-managed; publishable Supabase keys are public identifiers, while service-role keys and SMTP credentials must never be committed. Source checks cover known secret signatures and cannot establish that arbitrary text is free of sensitive data.

Authentication uses exact-origin and CSRF checks, bounded sessions and authoritative database roles. Commerce operations validate ownership and server-side amounts, with atomic stock/audit handling. These controls and automated tests are not a third-party penetration test or a guarantee of complete security. See `docs/accounts.md` for provider/session limitations and `docs/security.md` for the detailed threat model.
