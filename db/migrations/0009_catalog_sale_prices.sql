-- Selling price remains authoritative in carts, quotes and order snapshots.
ALTER TABLE product_variants ADD COLUMN compare_at_minor INTEGER
  CHECK(compare_at_minor IS NULL OR
    (compare_at_minor BETWEEN 1 AND 100000000 AND compare_at_minor > price_minor));
