ALTER TABLE users ADD COLUMN version INTEGER NOT NULL DEFAULT 0 CHECK(version >= 0);
ALTER TABLE addresses ADD COLUMN version INTEGER NOT NULL DEFAULT 0 CHECK(version >= 0);
-- Old sessions expire until their owner signs in again under the new policy.
ALTER TABLE sessions ADD COLUMN last_seen_at INTEGER NOT NULL DEFAULT 0;
CREATE TABLE auth_rate_limits (
  key TEXT PRIMARY KEY NOT NULL CHECK(length(key)=64),
  window_start INTEGER NOT NULL,
  attempts INTEGER NOT NULL CHECK(attempts>0),
  expires_at INTEGER NOT NULL
) STRICT;
CREATE INDEX auth_limits_expiry ON auth_rate_limits(expires_at);
