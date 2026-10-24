-- Additive migration: retain existing product/variant IDs, prices and inventory.
ALTER TABLE categories ADD COLUMN image_path TEXT NOT NULL DEFAULT '/images/product-placeholder.svg' CHECK(length(image_path) BETWEEN 1 AND 500);
ALTER TABLE categories ADD COLUMN version INTEGER NOT NULL DEFAULT 0 CHECK(version >= 0);
ALTER TABLE products ADD COLUMN subtitle TEXT NOT NULL DEFAULT '' CHECK(length(subtitle) <= 200);
ALTER TABLE products ADD COLUMN material TEXT NOT NULL DEFAULT '' CHECK(length(material) <= 1000);
ALTER TABLE products ADD COLUMN dimensions TEXT NOT NULL DEFAULT '' CHECK(length(dimensions) <= 500);
ALTER TABLE products ADD COLUMN care TEXT NOT NULL DEFAULT '' CHECK(length(care) <= 2000);
ALTER TABLE products ADD COLUMN is_new INTEGER NOT NULL DEFAULT 0 CHECK(is_new IN (0, 1));
ALTER TABLE products ADD COLUMN version INTEGER NOT NULL DEFAULT 0 CHECK(version >= 0);
ALTER TABLE product_variants ADD COLUMN swatch TEXT NOT NULL DEFAULT '#808080' CHECK(length(swatch) = 7 AND substr(swatch, 1, 1) = '#');
ALTER TABLE product_variants ADD COLUMN image_path TEXT NOT NULL DEFAULT '/images/product-placeholder.svg' CHECK(length(image_path) BETWEEN 1 AND 500);
ALTER TABLE product_variants ADD COLUMN detail_image_path TEXT NOT NULL DEFAULT '/images/product-placeholder.svg' CHECK(length(detail_image_path) BETWEEN 1 AND 500);
ALTER TABLE product_variants ADD COLUMN position INTEGER NOT NULL DEFAULT 0 CHECK(position >= 0);
CREATE INDEX products_active_new ON products(archived, is_new, name, id);
CREATE INDEX variants_product_position ON product_variants(product_id, active, position, id);
