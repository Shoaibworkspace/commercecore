// Admin routes authorize the actor and enforce CSRF before invoking this service.
import type { AuditContext } from '../repositories/audit.ts';
import { z } from 'zod';
import { imagePathSchema } from '../../../shared/catalog.ts';
import {
  categoryInputSchema,
  productInputSchema,
  variantInputSchema,
  createProductSchema,
  expectedVersionSchema,
} from '../validators/catalog-management.ts';
import * as repo from '../repositories/catalog-management.ts';
import { ServiceError } from './errors.ts';

function validate<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success)
    throw new ServiceError(400, 'INVALID_CATALOG_INPUT', 'Check the catalog fields.');
  return result.data;
}
const idSchema = z.string().min(1).max(100);
async function write<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof ServiceError) throw error;
    const message = error instanceof Error ? error.message : '';
    if (/malformed JSON/.test(message))
      throw new ServiceError(
        409,
        'STALE_CATALOG_VERSION',
        'The record changed or a required write was skipped. Reload before saving.',
      );
    if (/UNIQUE constraint failed/.test(message))
      throw new ServiceError(
        409,
        'CATALOG_CONFLICT',
        'The slug, SKU or variant label is already in use.',
      );
    if (/FOREIGN KEY constraint failed/.test(message))
      throw new ServiceError(
        400,
        'INVALID_REFERENCE',
        'The referenced category or product does not exist.',
      );
    throw new ServiceError(503, 'CATALOG_UNAVAILABLE', 'The catalog change could not be saved.');
  }
}
function updated(row: { version: number } | null) {
  if (!row)
    throw new ServiceError(
      409,
      'STALE_CATALOG_VERSION',
      'The record was changed or removed. Reload before saving.',
    );
  return row;
}
export async function createCategory(db: D1Database, input: unknown, audit?: AuditContext) {
  const value = validate(categoryInputSchema, input),
    id = crypto.randomUUID();
  await write(() => repo.insertCategory(db, id, value, audit));
  return { id, version: 0 };
}
export async function updateCategory(
  db: D1Database,
  id: string,
  version: number,
  input: unknown,
  audit?: AuditContext,
) {
  return updated(
    await write(() =>
      repo.changeCategory(
        db,
        validate(idSchema, id),
        validate(expectedVersionSchema, version),
        validate(categoryInputSchema, input),
        audit,
      ),
    ),
  );
}
export async function createProduct(db: D1Database, input: unknown, audit?: AuditContext) {
  const value = validate(createProductSchema, input),
    id = crypto.randomUUID();
  await write(() => repo.insertProduct(db, id, value, audit));
  return { id, version: 0 };
}
export async function updateProduct(
  db: D1Database,
  id: string,
  version: number,
  input: unknown,
  audit?: AuditContext,
) {
  return updated(
    await write(() =>
      repo.changeProduct(
        db,
        validate(idSchema, id),
        validate(expectedVersionSchema, version),
        validate(productInputSchema, input),
        audit,
      ),
    ),
  );
}
export async function archiveProduct(
  db: D1Database,
  id: string,
  version: number,
  archived = true,
  audit?: AuditContext,
) {
  return updated(
    await write(() =>
      repo.archiveProductRecord(
        db,
        validate(idSchema, id),
        validate(expectedVersionSchema, version),
        validate(z.boolean(), archived),
        audit,
      ),
    ),
  );
}
export async function createVariant(
  db: D1Database,
  productId: string,
  input: unknown,
  audit?: AuditContext,
) {
  const value = validate(variantInputSchema, input),
    id = crypto.randomUUID();
  const result = await write(() =>
    repo.insertVariant(db, id, validate(idSchema, productId), value, audit),
  );
  if (!result)
    throw new ServiceError(
      409,
      'VARIANT_LIMIT',
      'The product is missing or already has 20 variants.',
    );
  return { id, version: 0 };
}
export async function updateVariant(
  db: D1Database,
  id: string,
  version: number,
  input: unknown,
  audit?: AuditContext,
) {
  return updated(
    await write(() =>
      repo.changeVariant(
        db,
        validate(idSchema, id),
        validate(expectedVersionSchema, version),
        validate(variantInputSchema, input),
        audit,
      ),
    ),
  );
}
export async function setProductImage(
  db: D1Database,
  productId: string,
  position: number,
  input: unknown,
  audit?: AuditContext,
  version?: number,
) {
  const image = validate(
    z.object({ image: imagePathSchema, alt: z.string().min(1).max(200) }).strict(),
    input,
  );
  const result = await write(() =>
    repo.changeImage(
      db,
      validate(idSchema, productId),
      validate(z.number().int().min(0).max(11), position),
      image,
      audit,
      version === undefined ? undefined : validate(expectedVersionSchema, version),
    ),
  );
  if (audit && !result) updated(null);
  return result;
}
