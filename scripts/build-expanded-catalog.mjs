import { readFileSync, writeFileSync } from 'node:fs';
import { catalogSchema } from '../shared/catalog.ts';
import { expandedProducts, expandedGroups } from './expanded-catalog-data.mjs';

const path = new URL('../frontend/public/catalog.json', import.meta.url);
const addedIds = new Set(expandedProducts.map((p) => p.id));
const base = JSON.parse(readFileSync(path, 'utf8')).filter((p) => !addedIds.has(p.id));
if (base.length !== 12) throw new Error('Keep the original 12 products intact.');
const products = catalogSchema.parse([...base, ...expandedProducts]);
if (products.length !== 100 || new Set(products.map((p) => p.slug)).size !== 100)
  throw new Error('Expected 100 unique catalog products.');
writeFileSync(path, JSON.stringify(products, null, 2) + '\n');

const quote = (s) => `'${String(s).replaceAll("'", "''")}'`;
const sql = [
  '-- Apply after all numbered migrations, catalog.sql and storefront.sql.',
  '-- Additive seed: existing product, price, stock, gallery and category edits are never reset.',
];
for (const group of expandedGroups) {
  const photo = `/images/photos/${expandedProducts.find((p) => p.category === group.slug).slug}.webp`;
  sql.push(
    `INSERT INTO categories(id,slug,name,description,image_path) VALUES(${[`cat-${group.slug}`, group.slug, group.name, group.description, photo].map(quote)}) ON CONFLICT(id) DO NOTHING;`,
  );
}
for (const p of products.filter((p) => addedIds.has(p.id))) {
  sql.push(
    `INSERT INTO products(id,category_id,slug,name,description,subtitle,material,dimensions,care,featured,is_new) VALUES(${[p.id, `cat-${p.category}`, p.slug, p.name, p.description, p.subtitle, p.material, p.dimensions, p.care].map(quote)},${Number(p.featured)},${Number(p.isNew)}) ON CONFLICT(id) DO NOTHING;`,
  );
  p.variants.forEach((v, i) => {
    sql.push(
      `INSERT INTO product_variants(id,product_id,sku,label,color,swatch,size,image_path,detail_image_path,price_minor,compare_at_minor,stock,position) VALUES(${[v.id, p.id, v.id.toUpperCase(), v.label, v.label, v.color, v.size, v.image, v.detailImage].map(quote)},${v.priceMinor},${v.compareAtMinor ?? 'NULL'},${v.stock},${i}) ON CONFLICT(id) DO NOTHING;`,
    );
    sql.push(
      `INSERT INTO inventory_movements(id,variant_id,quantity_delta,reason,note) SELECT ${quote(`seed-${v.id}`)},id,stock,'SEED','Initial expanded sample inventory' FROM product_variants WHERE id=${quote(v.id)} AND stock>0 ON CONFLICT(id) DO NOTHING;`,
    );
  });
  p.gallery.forEach((image, i) =>
    sql.push(
      `INSERT INTO product_images(id,product_id,path,alt,position) VALUES(${[`${p.id}-image-${i}`, p.id, image.image, image.alt].map(quote)},${i}) ON CONFLICT(product_id,position) DO NOTHING;`,
    ),
  );
}
writeFileSync(new URL('../backend/db/seed/expanded.sql', import.meta.url), sql.join('\n') + '\n');
console.log(
  JSON.stringify({
    products: products.length,
    variants: products.reduce((n, p) => n + p.variants.length, 0),
    discountedProducts: products.filter((p) => p.variants.some((v) => v.compareAtMinor)).length,
    categories: [...new Set(products.map((p) => p.category))],
  }),
);
