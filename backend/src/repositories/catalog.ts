import type { CatalogQuery } from '../validators/catalog.ts';
import { catalogSchema, categorySchema } from '../../../shared/catalog.ts';
import type { Product } from '../../../shared/catalog.ts';

const productColumns = `p.id, p.slug, p.name, c.slug AS category, c.name AS categoryName,
  p.description, p.subtitle, p.material, p.dimensions, p.care, p.featured, p.is_new AS isNew,
  (SELECT MIN(v.price_minor) FROM product_variants v WHERE v.product_id = p.id AND v.active = 1) AS startingPrice`;
const productJSON = `json_object('id', r.id, 'slug', r.slug, 'name', r.name, 'category', r.category,
  'categoryName', r.categoryName, 'description', r.description, 'subtitle', r.subtitle,
  'material', r.material, 'dimensions', r.dimensions, 'care', r.care,
  'featured', json(CASE WHEN r.featured = 1 THEN 'true' ELSE 'false' END),
  'isNew', json(CASE WHEN r.isNew = 1 THEN 'true' ELSE 'false' END),
  'variants', json((SELECT json_group_array(json_object('id', v.id, 'label', v.label, 'color', v.swatch,
    'priceMinor', v.price_minor, 'compareAtMinor', v.compare_at_minor, 'size', v.size, 'stock', v.stock, 'image', v.image_path, 'detailImage', v.detail_image_path))
    FROM (SELECT * FROM product_variants WHERE product_id = r.id AND active = 1 ORDER BY position, id) v)),
  'gallery', json((SELECT json_group_array(json_object('image', i.path, 'alt', i.alt, 'position', i.position))
    FROM (SELECT path, alt, position FROM product_images WHERE product_id = r.id ORDER BY position) i)))`;
const orderBy = {
  featured: 'featured DESC, name COLLATE NOCASE, id',
  newest: 'isNew DESC, name COLLATE NOCASE, id',
  'price-asc': 'startingPrice ASC, name COLLATE NOCASE, id',
  'price-desc': 'startingPrice DESC, name COLLATE NOCASE, id',
  name: 'name COLLATE NOCASE, id',
} as const;

export async function listProducts(db: D1Database, query: CatalogQuery, excludeId?: string) {
  const conditions = [
    'p.archived = 0',
    'EXISTS (SELECT 1 FROM product_images i WHERE i.product_id = p.id)',
  ];
  const values: (string | number)[] = [];
  if (query.category) {
    conditions.push('c.slug = ?');
    values.push(query.category);
  }
  if (excludeId) {
    conditions.push('p.id != ?');
    values.push(excludeId);
  }
  if (query.featured) {
    conditions.push('p.featured = ?');
    values.push(Number(query.featured));
  }
  if (query.new) {
    conditions.push('p.is_new = ?');
    values.push(Number(query.new));
  }
  if (query.q.trim()) {
    // Literal substring matching: %/_ are ordinary characters, no LIKE pattern expansion.
    conditions.push(
      "instr(lower(p.name || ' ' || p.description || ' ' || c.slug || ' ' || p.material), lower(?)) > 0",
    );
    values.push(query.q.trim());
  }
  const variants = ['v.product_id = p.id', 'v.active = 1'];
  if (query.minPrice !== undefined) {
    variants.push('v.price_minor >= ?');
    values.push(query.minPrice);
  }
  if (query.maxPrice !== undefined) {
    variants.push('v.price_minor <= ?');
    values.push(query.maxPrice);
  }
  if (query.stock === '1') variants.push('v.stock > 0');
  if (query.sale === '1') variants.push('v.compare_at_minor > v.price_minor');
  conditions.push(`EXISTS (SELECT 1 FROM product_variants v WHERE ${variants.join(' AND ')})`);
  // One SQL statement gives totals, clamped page and product data from the same snapshot.
  const row = await db
    .prepare(
      `WITH eligible AS (
    SELECT ${productColumns} FROM products p JOIN categories c ON c.id = p.category_id
    WHERE ${conditions.join(' AND ')}
  ), totals AS (SELECT COUNT(*) AS total FROM eligible), page_rows AS (
    SELECT * FROM eligible ORDER BY ${orderBy[query.sort]}
    LIMIT ? OFFSET MIN(?, MAX(0, ((SELECT total FROM totals) - 1) / ?)) * ?
  ) SELECT (SELECT total FROM totals) AS total,
    (SELECT json_group_array(${productJSON}) FROM page_rows r) AS items`,
    )
    .bind(...values, query.pageSize!, query.page! - 1, query.pageSize!, query.pageSize!)
    .first<{ total: number; items: string }>();
  if (!row) throw new Error('Missing catalog result');
  const totalPages = Math.max(1, Math.ceil(row.total / query.pageSize!));
  return {
    data: catalogSchema.parse(JSON.parse(row.items)),
    meta: {
      total: row.total,
      totalPages,
      page: Math.min(query.page!, totalPages),
      pageSize: query.pageSize!,
    },
  };
}

export async function findProduct(db: D1Database, slug: string): Promise<Product | undefined> {
  const row = await db
    .prepare(
      `WITH product AS (
    SELECT ${productColumns} FROM products p JOIN categories c ON c.id = p.category_id
    WHERE p.slug = ? AND p.archived = 0
      AND EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = p.id AND v.active = 1)
      AND EXISTS (SELECT 1 FROM product_images i WHERE i.product_id = p.id)
  ) SELECT ${productJSON} AS item FROM product r`,
    )
    .bind(slug)
    .first<{ item: string }>();
  return row ? catalogSchema.parse([JSON.parse(row.item)])[0] : undefined;
}

export async function listCategories(db: D1Database) {
  const rows = await db
    .prepare(
      'SELECT id, slug, name, description, image_path AS image FROM categories ORDER BY created_at, id',
    )
    .all();
  return categorySchema.array().parse(rows.results);
}
