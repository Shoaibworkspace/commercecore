ALTER TABLE orders ADD COLUMN version INTEGER NOT NULL DEFAULT 0 CHECK(version>=0);
ALTER TABLE inventory_movements ADD COLUMN expected_version INTEGER;

CREATE TRIGGER inventory_adjust_guard BEFORE INSERT ON inventory_movements WHEN NEW.reason='ADJUSTMENT'
BEGIN
  SELECT CASE WHEN NEW.expected_version IS NULL OR NOT EXISTS(SELECT 1 FROM product_variants
    WHERE id=NEW.variant_id AND version=NEW.expected_version AND stock+NEW.quantity_delta BETWEEN 0 AND 1000000)
    THEN RAISE(ABORT,'inventory:stale') END;
END;
CREATE TRIGGER inventory_adjust_commit AFTER INSERT ON inventory_movements WHEN NEW.reason='ADJUSTMENT'
BEGIN
  UPDATE product_variants SET stock=stock+NEW.quantity_delta,version=version+1,updated_at=unixepoch()
    WHERE id=NEW.variant_id AND version=NEW.expected_version;
  SELECT CASE WHEN changes()<>1 THEN RAISE(ABORT,'inventory:missing') END;
END;

CREATE TRIGGER order_transition_guard BEFORE UPDATE OF status ON orders
WHEN NEW.status<>OLD.status
BEGIN
  SELECT CASE WHEN NEW.version<>OLD.version+1 OR OLD.stock_restored_at IS NOT NULL OR
    NOT ((OLD.status='CREATED' AND NEW.status IN ('CONFIRMED','CANCELLED')) OR
      (OLD.status='CONFIRMED' AND NEW.status IN ('PROCESSING','CANCELLED')) OR
      (OLD.status='PROCESSING' AND NEW.status IN ('SHIPPED','CANCELLED')) OR
      (OLD.status='SHIPPED' AND NEW.status='DELIVERED')) OR
    (NEW.status<>'CANCELLED' AND NEW.payment_status<>'SIMULATED_SUCCESS') OR
    (NEW.status='CANCELLED' AND NEW.stock_restored_at IS NULL)
  THEN RAISE(ABORT,'order:transition') END;
  SELECT CASE WHEN NEW.status='CANCELLED' AND (
    (SELECT count(*) FROM order_items WHERE order_id=OLD.id)=0 OR
    EXISTS(SELECT 1 FROM order_items i WHERE i.order_id=OLD.id AND NOT EXISTS(
      SELECT 1 FROM inventory_movements m WHERE m.order_id=OLD.id AND m.variant_id=i.variant_id
      AND m.reason='ORDER' AND m.quantity_delta=-i.quantity)))
  THEN RAISE(ABORT,'order:ledger') END;
END;

CREATE TRIGGER order_cancel_stock AFTER UPDATE OF status ON orders
WHEN NEW.status='CANCELLED' AND OLD.status<>'CANCELLED'
BEGIN
  UPDATE product_variants SET stock=stock+(SELECT quantity FROM order_items WHERE order_id=NEW.id AND variant_id=product_variants.id),
    version=version+1,updated_at=unixepoch() WHERE id IN(SELECT variant_id FROM order_items WHERE order_id=NEW.id);
  SELECT CASE WHEN changes()<>(SELECT count(*) FROM order_items WHERE order_id=NEW.id)
    THEN RAISE(ABORT,'order:inventory') END;
  INSERT INTO inventory_movements(id,variant_id,order_id,actor_id,quantity_delta,reason,note)
    SELECT lower(hex(randomblob(16))),variant_id,NEW.id,NULL,quantity,'CANCELLATION','Order cancellation'
    FROM order_items WHERE order_id=NEW.id;
  SELECT CASE WHEN changes()<>(SELECT count(*) FROM order_items WHERE order_id=NEW.id)
    THEN RAISE(ABORT,'order:ledger') END;
END;

CREATE INDEX audit_created ON audit_logs(created_at DESC,id DESC);
CREATE INDEX movements_created ON inventory_movements(created_at DESC,id DESC);

CREATE TRIGGER user_role_audit AFTER UPDATE OF role ON users WHEN NEW.role<>OLD.role
BEGIN
  INSERT INTO audit_logs(id,actor_id,action,entity_type,entity_id,metadata_json,request_id)
    VALUES(lower(hex(randomblob(16))),NULL,'LOCAL_ROLE_CHANGED','user',NEW.id,
      json_object('from',OLD.role,'to',NEW.role),'local-operator');
END;
