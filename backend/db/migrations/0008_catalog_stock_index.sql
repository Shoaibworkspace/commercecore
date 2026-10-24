-- Product-scoped stock predicates must not scan the global active/stock index
-- once the sample catalog grows. Price and stock still match the same variant.
CREATE INDEX variants_product_stock ON product_variants(product_id,active,stock);
