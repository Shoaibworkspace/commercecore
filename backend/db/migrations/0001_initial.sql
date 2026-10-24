-- Authoritative schema. New changes go in new numbered migrations.
-- D1 enforces foreign keys. Explicitly enable them for standalone SQLite tools.
PRAGMA foreign_keys = ON;

CREATE TABLE users (
  id TEXT PRIMARY KEY NOT NULL,
  email TEXT NOT NULL COLLATE NOCASE UNIQUE CHECK(length(email) BETWEEN 3 AND 254 AND email = lower(email)),
  name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 100),
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'customer' CHECK(role IN ('customer', 'admin')),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
) STRICT;

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY NOT NULL CHECK(length(token_hash) = 64),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  csrf_token_hash TEXT NOT NULL CHECK(length(csrf_token_hash) = 64),
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  CHECK(expires_at > created_at)
) STRICT;
CREATE INDEX sessions_user ON sessions(user_id);
CREATE INDEX sessions_expiry ON sessions(expires_at);

CREATE TABLE addresses (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient TEXT NOT NULL CHECK(length(recipient) BETWEEN 1 AND 100),
  line1 TEXT NOT NULL CHECK(length(line1) BETWEEN 1 AND 200),
  line2 TEXT NOT NULL DEFAULT '' CHECK(length(line2) <= 200),
  city TEXT NOT NULL CHECK(length(city) BETWEEN 1 AND 100),
  region TEXT NOT NULL CHECK(length(region) BETWEEN 1 AND 100),
  postal_code TEXT NOT NULL CHECK(length(postal_code) BETWEEN 1 AND 20),
  country_code TEXT NOT NULL DEFAULT 'IN' CHECK(length(country_code) = 2),
  phone TEXT NOT NULL CHECK(length(phone) BETWEEN 5 AND 30),
  is_default INTEGER NOT NULL DEFAULT 0 CHECK(is_default IN (0, 1)),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
) STRICT;
CREATE INDEX addresses_user ON addresses(user_id);
CREATE UNIQUE INDEX addresses_one_default ON addresses(user_id) WHERE is_default = 1;

CREATE TABLE categories (
  id TEXT PRIMARY KEY NOT NULL,
  slug TEXT NOT NULL UNIQUE CHECK(length(slug) BETWEEN 1 AND 100),
  name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 100),
  description TEXT NOT NULL DEFAULT '' CHECK(length(description) <= 2000),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
) STRICT;

CREATE TABLE products (
  id TEXT PRIMARY KEY NOT NULL,
  category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  slug TEXT NOT NULL UNIQUE CHECK(length(slug) BETWEEN 1 AND 150),
  name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 150),
  description TEXT NOT NULL CHECK(length(description) <= 10000),
  featured INTEGER NOT NULL DEFAULT 0 CHECK(featured IN (0, 1)),
  archived INTEGER NOT NULL DEFAULT 0 CHECK(archived IN (0, 1)),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
) STRICT;
CREATE INDEX products_category_active ON products(category_id, archived, created_at);
CREATE INDEX products_featured_active ON products(featured, archived);
CREATE INDEX products_active_name ON products(archived, name);

CREATE TABLE product_variants (
  id TEXT PRIMARY KEY NOT NULL,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  sku TEXT NOT NULL UNIQUE CHECK(length(sku) BETWEEN 1 AND 100),
  label TEXT NOT NULL CHECK(length(label) BETWEEN 1 AND 100),
  color TEXT NOT NULL DEFAULT '' CHECK(length(color) <= 50),
  size TEXT NOT NULL DEFAULT '' CHECK(length(size) <= 50),
  price_minor INTEGER NOT NULL CHECK(price_minor BETWEEN 0 AND 100000000),
  stock INTEGER NOT NULL DEFAULT 0 CHECK(stock BETWEEN 0 AND 1000000),
  low_stock_threshold INTEGER NOT NULL DEFAULT 5 CHECK(low_stock_threshold BETWEEN 0 AND 1000000),
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0, 1)),
  version INTEGER NOT NULL DEFAULT 0 CHECK(version >= 0),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(product_id, label)
) STRICT;
CREATE INDEX variants_product_active_price ON product_variants(product_id, active, price_minor);
CREATE INDEX variants_stock ON product_variants(active, stock);

CREATE TABLE product_images (
  id TEXT PRIMARY KEY NOT NULL,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  path TEXT NOT NULL CHECK(length(path) BETWEEN 1 AND 500),
  alt TEXT NOT NULL CHECK(length(alt) BETWEEN 1 AND 200),
  position INTEGER NOT NULL DEFAULT 0 CHECK(position >= 0),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(product_id, position)
) STRICT;

CREATE TABLE carts (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  version INTEGER NOT NULL DEFAULT 0 CHECK(version >= 0),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
) STRICT;
CREATE TABLE cart_items (
  cart_id TEXT NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
  variant_id TEXT NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL CHECK(quantity BETWEEN 1 AND 20),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY(cart_id, variant_id)
) STRICT;
CREATE INDEX cart_items_variant ON cart_items(variant_id);

CREATE TABLE wishlists (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
) STRICT;
CREATE TABLE wishlist_items (
  wishlist_id TEXT NOT NULL REFERENCES wishlists(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY(wishlist_id, product_id)
) STRICT;
CREATE INDEX wishlist_items_product ON wishlist_items(product_id);

CREATE TABLE orders (
  id TEXT PRIMARY KEY NOT NULL,
  order_number TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'CREATED' CHECK(status IN ('CREATED', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED')),
  payment_mode TEXT NOT NULL DEFAULT 'demo' CHECK(payment_mode = 'demo'),
  payment_status TEXT NOT NULL CHECK(payment_status IN ('SIMULATED_SUCCESS', 'SIMULATED_FAILURE')),
  currency TEXT NOT NULL DEFAULT 'INR' CHECK(currency = 'INR'),
  subtotal_minor INTEGER NOT NULL CHECK(subtotal_minor BETWEEN 0 AND 1000000000000),
  shipping_minor INTEGER NOT NULL CHECK(shipping_minor BETWEEN 0 AND 100000000),
  tax_minor INTEGER NOT NULL CHECK(tax_minor BETWEEN 0 AND 1000000000000),
  total_minor INTEGER NOT NULL CHECK(total_minor = subtotal_minor + shipping_minor + tax_minor),
  delivery_json TEXT NOT NULL CHECK(json_valid(delivery_json)),
  stock_restored_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  CHECK(stock_restored_at IS NULL OR status = 'CANCELLED')
) STRICT;
CREATE INDEX orders_user_created ON orders(user_id, created_at DESC);
CREATE INDEX orders_status_created ON orders(status, created_at DESC);
CREATE INDEX orders_created ON orders(created_at);

CREATE TABLE order_items (
  id TEXT PRIMARY KEY NOT NULL,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  variant_id TEXT NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT,
  product_name TEXT NOT NULL,
  variant_label TEXT NOT NULL,
  sku TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK(quantity BETWEEN 1 AND 20),
  unit_price_minor INTEGER NOT NULL CHECK(unit_price_minor BETWEEN 0 AND 100000000),
  line_total_minor INTEGER NOT NULL CHECK(line_total_minor = unit_price_minor * quantity),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(order_id, variant_id)
) STRICT;
CREATE INDEX order_items_variant ON order_items(variant_id);

CREATE TABLE inventory_movements (
  id TEXT PRIMARY KEY NOT NULL,
  variant_id TEXT NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT,
  order_id TEXT REFERENCES orders(id) ON DELETE RESTRICT,
  actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  quantity_delta INTEGER NOT NULL CHECK(quantity_delta != 0 AND abs(quantity_delta) <= 1000000),
  reason TEXT NOT NULL CHECK(reason IN ('SEED', 'ADJUSTMENT', 'ORDER', 'CANCELLATION')),
  note TEXT NOT NULL DEFAULT '' CHECK(length(note) <= 500),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  CHECK((reason IN ('ORDER', 'CANCELLATION') AND order_id IS NOT NULL) OR (reason IN ('SEED', 'ADJUSTMENT') AND order_id IS NULL)),
  CHECK((reason = 'ORDER' AND quantity_delta < 0) OR (reason = 'CANCELLATION' AND quantity_delta > 0) OR reason IN ('SEED', 'ADJUSTMENT'))
) STRICT;
CREATE INDEX movements_variant_created ON inventory_movements(variant_id, created_at DESC);
CREATE UNIQUE INDEX movements_once_per_order ON inventory_movements(order_id, variant_id, reason) WHERE order_id IS NOT NULL;

CREATE TABLE checkout_idempotency_keys (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  key TEXT NOT NULL CHECK(length(key) BETWEEN 16 AND 128),
  request_hash TEXT NOT NULL CHECK(length(request_hash) = 64),
  order_id TEXT NOT NULL UNIQUE REFERENCES orders(id) ON DELETE RESTRICT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY(user_id, key)
) STRICT;

CREATE TABLE audit_logs (
  id TEXT PRIMARY KEY NOT NULL,
  actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL CHECK(length(action) BETWEEN 1 AND 100),
  entity_type TEXT NOT NULL CHECK(length(entity_type) BETWEEN 1 AND 100),
  entity_id TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(metadata_json)),
  request_id TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
) STRICT;
CREATE INDEX audit_actor_created ON audit_logs(actor_id, created_at DESC);
CREATE INDEX audit_entity ON audit_logs(entity_type, entity_id, created_at DESC);
