-- Every line mutation invalidates stale cart edits, including direct maintenance writes.
CREATE TRIGGER cart_item_insert AFTER INSERT ON cart_items
BEGIN
  UPDATE carts SET version = version + 1, updated_at = unixepoch() WHERE id = NEW.cart_id;
END;
CREATE TRIGGER cart_item_update AFTER UPDATE OF quantity ON cart_items
BEGIN
  UPDATE carts SET version = version + 1, updated_at = unixepoch() WHERE id = NEW.cart_id;
END;
CREATE TRIGGER cart_item_delete AFTER DELETE ON cart_items
BEGIN
  UPDATE carts SET version = version + 1, updated_at = unixepoch() WHERE id = OLD.cart_id;
END;
