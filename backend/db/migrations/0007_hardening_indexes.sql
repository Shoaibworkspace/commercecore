-- Stable pagination and bounded housekeeping on growing local/public databases.
CREATE INDEX orders_user_page ON orders(user_id,created_at DESC,id DESC);
CREATE INDEX orders_status_page ON orders(status,created_at DESC,id DESC);
CREATE INDEX orders_created_page ON orders(created_at DESC,id DESC);
CREATE INDEX sessions_idle ON sessions(last_seen_at);
