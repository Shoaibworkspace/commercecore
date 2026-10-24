# Services

Business rules belong here: authoritative totals, stock transaction construction, idempotency, fulfillment transitions and cancellation. Route handlers validate and authorize before calling services. Implement one phase at a time; no unfinished service is exposed through an API.

Phase 3 implements catalog reads with safe availability errors and internal product/category/variant/image management. Management services validate data and use atomic creation or optimistic versions. They are deliberately not mounted until session/role and CSRF enforcement exists. They never adjust inventory or accept customer-reported prices as checkout totals.

Phase 4 adds native password hashing, session bootstrap/rotation/revocation, CSRF/origin checks, shared rate limits, and an explicit public-auth release gate. Customer account routes use the authorization middleware; admin product mutation handlers are still reserved for Phase 7. No service accepts customer roles or arbitrary inventory updates.
