import { auditStatement, catalogWrite, writeGuard, type AuditContext } from './audit.ts';
import { z } from 'zod';
import {
  categoryInputSchema,
  productInputSchema,
  variantInputSchema,
  createProductSchema,
} from '../validators/catalog-management.ts';

type CategoryInput = z.infer<typeof categoryInputSchema>;
type ProductInput = z.infer<typeof productInputSchema>;
type VariantInput = z.infer<typeof variantInputSchema>;
type CreateProductInput = z.infer<typeof createProductSchema>;
const productValues = (input: ProductInput) => [
  input.categoryId,
  input.slug,
  input.name,
  input.description,
  input.subtitle,
  input.material,
  input.dimensions,
  input.care,
  Number(input.featured),
  Number(input.isNew),
];
const variantValues = (input: VariantInput) => [
  input.sku,
  input.label,
  input.color,
  input.size,
  input.priceMinor,
  input.compareAtMinor,
  input.image,
  input.detailImage,
  Number(input.active),
  input.position,
];

export async function insertCategory(
  db: D1Database,
  id: string,
  input: CategoryInput,
  audit?: AuditContext,
) {
  await catalogWrite(
    db,
    db
      .prepare(
        'INSERT INTO categories (id,slug,name,description,image_path) VALUES (?,?,?,?,?) RETURNING id',
      )
      .bind(id, input.slug, input.name, input.description, input.image),
    audit,
    'CATEGORY_CREATED',
    'category',
    id,
  );
}
export async function changeCategory(
  db: D1Database,
  id: string,
  version: number,
  input: CategoryInput,
  audit?: AuditContext,
) {
  const statement = db
    .prepare(
      `UPDATE categories SET slug=?,name=?,description=?,image_path=?,version=version+1,updated_at=unixepoch()
    WHERE id=? AND version=? RETURNING version`,
    )
    .bind(input.slug, input.name, input.description, input.image, id, version);
  return (
    (await catalogWrite(db, statement, audit, 'CATEGORY_UPDATED', 'category', id)).results[0] ??
    null
  );
}
export async function insertProduct(
  db: D1Database,
  id: string,
  input: CreateProductInput,
  audit?: AuditContext,
) {
  const statements = [
    db
      .prepare(
        `INSERT INTO products (id,category_id,slug,name,description,subtitle,material,dimensions,care,featured,is_new)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .bind(id, ...productValues(input)),
  ];
  for (const variant of input.variants)
    statements.push(
      db
        .prepare(
          `INSERT INTO product_variants
    (id,product_id,sku,label,swatch,size,price_minor,compare_at_minor,image_path,detail_image_path,active,position)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .bind(crypto.randomUUID(), id, ...variantValues(variant)),
    );
  input.gallery.forEach((image, position) =>
    statements.push(
      db
        .prepare('INSERT INTO product_images (id,product_id,path,alt,position) VALUES (?,?,?,?,?)')
        .bind(crypto.randomUUID(), id, image.image, image.alt, position),
    ),
  );
  // D1 batch rolls back the entire product + variants + gallery on any SQL failure.
  if (audit) {
    await db.batch([
      auditStatement(db, audit, 'PRODUCT_CREATED', 'product', id, {}, false),
      writeGuard(db),
      ...statements.flatMap((statement) => [statement, writeGuard(db)]),
    ]);
  } else await db.batch(statements);
}
export async function changeProduct(
  db: D1Database,
  id: string,
  version: number,
  input: ProductInput,
  audit?: AuditContext,
) {
  const statement = db
    .prepare(
      `UPDATE products SET category_id=?,slug=?,name=?,description=?,subtitle=?,material=?,dimensions=?,care=?,featured=?,is_new=?,
    version=version+1,updated_at=unixepoch() WHERE id=? AND version=? RETURNING version`,
    )
    .bind(...productValues(input), id, version);
  return (
    (await catalogWrite(db, statement, audit, 'PRODUCT_UPDATED', 'product', id)).results[0] ?? null
  );
}
export async function archiveProductRecord(
  db: D1Database,
  id: string,
  version: number,
  archived: boolean,
  audit?: AuditContext,
) {
  const statement = db
    .prepare(
      'UPDATE products SET archived=?,version=version+1,updated_at=unixepoch() WHERE id=? AND version=? RETURNING version',
    )
    .bind(Number(archived), id, version);
  return (
    (await catalogWrite(db, statement, audit, 'PRODUCT_ARCHIVED', 'product', id)).results[0] ?? null
  );
}
export async function insertVariant(
  db: D1Database,
  id: string,
  productId: string,
  input: VariantInput,
  audit?: AuditContext,
) {
  // Enforce the public contract's bounded variant count, including inactive entries.
  const statement = db
    .prepare(
      `INSERT INTO product_variants (id,product_id,sku,label,swatch,size,price_minor,compare_at_minor,image_path,detail_image_path,active,position)
    SELECT ?,p.id,?,?,?,?,?,?,?,?,?,? FROM products p WHERE p.id=?
    AND (SELECT COUNT(*) FROM product_variants WHERE product_id=p.id)<20 RETURNING id`,
    )
    .bind(id, ...variantValues(input), productId);
  return (
    (await catalogWrite(db, statement, audit, 'VARIANT_CREATED', 'variant', id)).results[0] ?? null
  );
}
export async function changeVariant(
  db: D1Database,
  id: string,
  version: number,
  input: VariantInput,
  audit?: AuditContext,
) {
  // Stock is deliberately not writable here. Phase 7 adjustments must also write the ledger.
  const statement = db
    .prepare(
      `UPDATE product_variants SET sku=?,label=?,swatch=?,size=?,price_minor=?,compare_at_minor=?,image_path=?,detail_image_path=?,active=?,position=?,
    version=version+1,updated_at=unixepoch() WHERE id=? AND version=? RETURNING version`,
    )
    .bind(...variantValues(input), id, version);
  return (
    (await catalogWrite(db, statement, audit, 'VARIANT_UPDATED', 'variant', id)).results[0] ?? null
  );
}
export async function changeImage(
  db: D1Database,
  productId: string,
  position: number,
  image: { image: string; alt: string },
  audit?: AuditContext,
  version?: number,
) {
  if (audit) {
    const results = await db.batch([
      auditStatement(db, audit, 'PRODUCT_IMAGE_UPDATED', 'product', productId, { position }, false),
      writeGuard(db),
      db
        .prepare(
          'UPDATE products SET version=version+1,updated_at=unixepoch() WHERE id=? AND version=? RETURNING version',
        )
        .bind(productId, version!),
      writeGuard(db),
      db
        .prepare(
          `INSERT INTO product_images(id,product_id,path,alt,position) VALUES(?,?,?,?,?)
        ON CONFLICT(product_id,position) DO UPDATE SET path=excluded.path,alt=excluded.alt`,
        )
        .bind(crypto.randomUUID(), productId, image.image, image.alt, position),
      writeGuard(db),
    ]);
    return results[2]!.results[0] ?? null;
  }
  await db
    .prepare(
      `INSERT INTO product_images(id,product_id,path,alt,position) VALUES(?,?,?,?,?)
    ON CONFLICT(product_id,position) DO UPDATE SET path=excluded.path,alt=excluded.alt`,
    )
    .bind(crypto.randomUUID(), productId, image.image, image.alt, position)
    .run();
  return { version: 0 };
}
