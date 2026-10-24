import { readFileSync, writeFileSync } from 'node:fs';
import { catalogSchema } from '../shared/catalog.ts';
import { expandedProducts } from './expanded-catalog-data.mjs';

// Existing IDs are referenced by carts/orders. Never rename or replace them.
const productIds = { 'prod-tote': 'prod-bag' };
const variantIds = {
  'var-lamp-main': 'var-lamp-sage',
  'var-lamp-alt': 'var-lamp-ink',
  'var-tote-main': 'var-bag-natural',
  'var-cup-main': 'var-cup-sand',
};
const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
const expandedIds = new Set(expandedProducts.map((p) => p.id));
const products = catalogSchema
  .parse(JSON.parse(readFileSync(new URL('../public/catalog.json', import.meta.url), 'utf8')))
  .filter((p) => !expandedIds.has(p.id));
const categories = [
  [
    'workspace',
    'Workspace',
    'A little clarity for your working day.',
    '/images/photos/lamp-main.webp',
  ],
  [
    'everyday',
    'Everyday',
    'Considered companions for wherever you go.',
    '/images/photos/tote-main.webp',
  ],
  ['home', 'Home', 'Quiet details that make a place yours.', '/images/photos/cup-main.webp'],
];
const sql = [
  '-- Retained storefront sample seed. Apply after catalog migrations and the original catalog.sql.',
  '-- Repeat-safe: prices, inventory, archive flags and edited metadata are retained.',
];
for (const [slug, name, description, image] of categories) {
  const id = `cat-${slug}`;
  sql.push(
    `INSERT INTO categories (id,slug,name,description,image_path) VALUES (${[id, slug, name, description, image].map(quote)}) ON CONFLICT(id) DO NOTHING;`,
  );
  sql.push(
    `UPDATE categories SET image_path=${quote(image)} WHERE id=${quote(id)} AND image_path='/images/product-placeholder.svg' AND version=0;`,
  );
}
for (const product of products) {
  const id = productIds[product.id] ?? product.id;
  const text = [
    id,
    `cat-${product.category}`,
    product.slug,
    product.name,
    product.description,
    product.subtitle,
    product.material,
    product.dimensions,
    product.care,
  ].map(quote);
  sql.push(
    `INSERT INTO products (id,category_id,slug,name,description,subtitle,material,dimensions,care,featured,is_new) VALUES (${text},${Number(product.featured)},${Number(product.isNew)}) ON CONFLICT(id) DO NOTHING;`,
  );
  sql.push(
    `UPDATE products SET subtitle=${quote(product.subtitle)},material=${quote(product.material)},dimensions=${quote(product.dimensions)},care=${quote(product.care)},is_new=${Number(product.isNew)} WHERE id=${quote(id)} AND subtitle='' AND version=0;`,
  );
  product.variants.forEach((variant, position) => {
    const variantId = variantIds[variant.id] ?? variant.id;
    const fields = [
      variantId,
      id,
      variantId.toUpperCase(),
      variant.label,
      variant.label,
      variant.color,
      variant.image,
      variant.detailImage,
    ].map(quote);
    sql.push(
      `INSERT INTO product_variants (id,product_id,sku,label,color,swatch,image_path,detail_image_path,price_minor,stock,position) VALUES (${fields},${variant.priceMinor},${variant.stock},${position}) ON CONFLICT(id) DO NOTHING;`,
    );
    sql.push(
      `UPDATE product_variants SET swatch=${quote(variant.color)},image_path=${quote(variant.image)},detail_image_path=${quote(variant.detailImage)},position=${position} WHERE id=${quote(variantId)} AND image_path='/images/product-placeholder.svg' AND version=0;`,
    );
    if (variant.stock > 0)
      sql.push(
        `INSERT INTO inventory_movements (id,variant_id,quantity_delta,reason,note) SELECT ${quote(`seed-${variantId}`)},id,stock,'SEED','Initial sample inventory' FROM product_variants WHERE id=${quote(variantId)} AND stock>0 ON CONFLICT(id) DO NOTHING;`,
      );
  });
  product.gallery.forEach((image, position) => {
    sql.push(
      `INSERT INTO product_images (id,product_id,path,alt,position) VALUES (${[`${id}-image-${position}`, id, image.image, image.alt].map(quote)},${position}) ON CONFLICT(product_id,position) DO NOTHING;`,
    );
  });
}
writeFileSync(new URL('../db/seed/storefront.sql', import.meta.url), sql.join('\n') + '\n');
console.log(`Generated retained storefront seed for ${products.length} products.`);
