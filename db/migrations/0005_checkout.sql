CREATE TABLE checkout_quotes (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cart_id TEXT NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
  cart_version INTEGER NOT NULL CHECK(cart_version>=0),
  address_id TEXT NOT NULL,
  address_version INTEGER NOT NULL CHECK(address_version>=0),
  pricing_version TEXT NOT NULL,
  items_json TEXT NOT NULL CHECK(json_valid(items_json) AND json_type(items_json)='array' AND json_array_length(items_json) BETWEEN 1 AND 50),
  delivery_json TEXT NOT NULL CHECK(json_valid(delivery_json)),
  subtotal_minor INTEGER NOT NULL CHECK(subtotal_minor BETWEEN 0 AND 1000000000000),
  shipping_minor INTEGER NOT NULL CHECK(shipping_minor BETWEEN 0 AND 100000000),
  tax_minor INTEGER NOT NULL CHECK(tax_minor BETWEEN 0 AND 1000000000000),
  total_minor INTEGER NOT NULL CHECK(total_minor=subtotal_minor+shipping_minor+tax_minor),
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT(unixepoch())
) STRICT;
CREATE INDEX quotes_user_created ON checkout_quotes(user_id,created_at DESC);
ALTER TABLE orders ADD COLUMN checkout_quote_id TEXT REFERENCES checkout_quotes(id) ON DELETE RESTRICT;
CREATE UNIQUE INDEX orders_once_per_quote ON orders(checkout_quote_id) WHERE checkout_quote_id IS NOT NULL;
ALTER TABLE order_items ADD COLUMN image_path TEXT NOT NULL DEFAULT '/images/product-placeholder.svg';

CREATE TRIGGER checkout_validate BEFORE INSERT ON orders WHEN NEW.checkout_quote_id IS NOT NULL
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM checkout_quotes q JOIN carts c ON c.id=q.cart_id
    JOIN addresses a ON a.id=q.address_id
    WHERE q.id=NEW.checkout_quote_id AND q.user_id=NEW.user_id AND c.user_id=NEW.user_id
      AND a.user_id=NEW.user_id AND a.version=q.address_version AND c.version=q.cart_version
      AND q.expires_at>unixepoch() AND q.pricing_version='demo-2026-v1'
      AND NEW.status='CONFIRMED' AND NEW.payment_status='SIMULATED_SUCCESS' AND NEW.payment_mode='demo'
      AND NEW.subtotal_minor=q.subtotal_minor AND NEW.shipping_minor=q.shipping_minor
      AND NEW.tax_minor=q.tax_minor AND NEW.total_minor=q.total_minor AND NEW.delivery_json=q.delivery_json
      AND (SELECT count(*) FROM cart_items WHERE cart_id=c.id)=json_array_length(q.items_json)
      AND NOT EXISTS (SELECT 1 FROM json_each(q.items_json) j
        LEFT JOIN cart_items ci ON ci.cart_id=c.id AND ci.variant_id=json_extract(j.value,'$.variantId')
        LEFT JOIN product_variants v ON v.id=ci.variant_id LEFT JOIN products p ON p.id=v.product_id
        WHERE ci.variant_id IS NULL OR ci.quantity!=json_extract(j.value,'$.quantity') OR v.active!=1 OR p.archived!=0
          OR v.stock<ci.quantity OR v.price_minor!=json_extract(j.value,'$.unitPriceMinor')
          OR v.sku!=json_extract(j.value,'$.sku') OR v.label!=json_extract(j.value,'$.variantLabel')
          OR p.name!=json_extract(j.value,'$.productName'))
  ) THEN RAISE(ABORT,'checkout:stale') END;
END;

CREATE TRIGGER checkout_commit AFTER INSERT ON orders WHEN NEW.checkout_quote_id IS NOT NULL
BEGIN
  INSERT INTO order_items(id,order_id,variant_id,product_name,variant_label,sku,quantity,unit_price_minor,line_total_minor,image_path)
    SELECT lower(hex(randomblob(16))),NEW.id,json_extract(j.value,'$.variantId'),json_extract(j.value,'$.productName'),
      json_extract(j.value,'$.variantLabel'),json_extract(j.value,'$.sku'),json_extract(j.value,'$.quantity'),
      json_extract(j.value,'$.unitPriceMinor'),json_extract(j.value,'$.lineTotalMinor'),json_extract(j.value,'$.image')
    FROM checkout_quotes q,json_each(q.items_json) j WHERE q.id=NEW.checkout_quote_id;
  SELECT CASE WHEN changes()!=(SELECT json_array_length(items_json) FROM checkout_quotes WHERE id=NEW.checkout_quote_id)
    THEN RAISE(ABORT,'checkout:items') END;
  UPDATE product_variants SET stock=stock-(SELECT quantity FROM order_items WHERE order_id=NEW.id AND variant_id=product_variants.id),
    version=version+1,updated_at=unixepoch()
    WHERE id IN (SELECT variant_id FROM order_items WHERE order_id=NEW.id)
      AND stock>=(SELECT quantity FROM order_items WHERE order_id=NEW.id AND variant_id=product_variants.id);
  SELECT CASE WHEN changes()!=(SELECT count(*) FROM order_items WHERE order_id=NEW.id)
    THEN RAISE(ABORT,'checkout:inventory') END;
  INSERT INTO inventory_movements(id,variant_id,order_id,actor_id,quantity_delta,reason,note)
    SELECT lower(hex(randomblob(16))),variant_id,NEW.id,NEW.user_id,-quantity,'ORDER','Demo checkout'
    FROM order_items WHERE order_id=NEW.id;
  SELECT CASE WHEN changes()!=(SELECT count(*) FROM order_items WHERE order_id=NEW.id)
    THEN RAISE(ABORT,'checkout:ledger') END;
  DELETE FROM cart_items WHERE cart_id=(SELECT cart_id FROM checkout_quotes WHERE id=NEW.checkout_quote_id);
  SELECT CASE WHEN changes()!=(SELECT count(*) FROM order_items WHERE order_id=NEW.id)
    THEN RAISE(ABORT,'checkout:cart') END;
END;
