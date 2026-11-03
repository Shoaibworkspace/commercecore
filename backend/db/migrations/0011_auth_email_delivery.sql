-- Store delivery fingerprints only: never email addresses, codes or confirmation links.
CREATE TABLE auth_email_deliveries (
  id TEXT PRIMARY KEY CHECK(length(id)=64),
  payload_hash TEXT NOT NULL CHECK(length(payload_hash)=64),
  status TEXT NOT NULL CHECK(status IN ('sending','sent')),
  owner TEXT NOT NULL,
  lease_until INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
) STRICT;
CREATE INDEX idx_auth_email_delivery_cleanup ON auth_email_deliveries(updated_at);
