-- Sample catalog only. No users, admin credentials, or session tokens.
-- Repeat-safe: does not overwrite existing prices, inventory, or catalog edits.
INSERT INTO categories (id, slug, name, description) VALUES
  ('cat-workspace', 'workspace', 'Workspace', 'Objects for a considered working day.'),
  ('cat-everyday', 'everyday', 'Everyday', 'Useful essentials, thoughtfully made.'),
  ('cat-home', 'home', 'Home', 'Quiet details for a comfortable space.')
ON CONFLICT(id) DO NOTHING;

INSERT INTO products (id, category_id, slug, name, description, featured) VALUES
  ('prod-lamp', 'cat-workspace', 'arc-desk-lamp', 'Arc Desk Lamp', 'A compact desk lamp with an adjustable shade and warm light. Sample demonstration product.', 1),
  ('prod-bag', 'cat-everyday', 'daily-canvas-tote', 'Daily Canvas Tote', 'A generous canvas carryall with an internal pocket. Sample demonstration product.', 1),
  ('prod-cup', 'cat-home', 'studio-ceramic-cup', 'Studio Ceramic Cup', 'A gently rounded ceramic cup with a matte finish. Sample demonstration product.', 1)
ON CONFLICT(id) DO NOTHING;

INSERT INTO product_variants (id, product_id, sku, label, color, price_minor, stock) VALUES
  ('var-lamp-sage', 'prod-lamp', 'ARC-SAGE', 'Sage', 'Sage', 249900, 12),
  ('var-lamp-ink', 'prod-lamp', 'ARC-INK', 'Ink', 'Ink', 249900, 8),
  ('var-bag-natural', 'prod-bag', 'TOTE-NAT', 'Natural', 'Natural', 129900, 20),
  ('var-cup-sand', 'prod-cup', 'CUP-SAND', 'Sand', 'Sand', 79900, 4)
ON CONFLICT(id) DO NOTHING;

INSERT INTO inventory_movements (id, variant_id, quantity_delta, reason, note)
SELECT 'seed-' || id, id, stock, 'SEED', 'Initial sample inventory'
FROM product_variants WHERE id IN ('var-lamp-sage', 'var-lamp-ink', 'var-bag-natural', 'var-cup-sand') AND stock > 0
ON CONFLICT(id) DO NOTHING;
