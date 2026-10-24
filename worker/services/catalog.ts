import type { CatalogQuery } from '../validators/catalog.ts';
import { catalogQuerySchema } from '../validators/catalog.ts';
import { findProduct, listProducts, listCategories } from '../repositories/catalog.ts';
import { ServiceError } from './errors.ts';

async function readCatalog<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof ServiceError) throw error;
    throw new ServiceError(
      503,
      'CATALOG_UNAVAILABLE',
      'The collection is temporarily unavailable. Please try again.',
    );
  }
}
export const getCategories = (db: D1Database) => readCatalog(() => listCategories(db));
export const getProducts = (db: D1Database, query: CatalogQuery) =>
  readCatalog(() => listProducts(db, query));
export const getProduct = (db: D1Database, slug: string) =>
  readCatalog(async () => {
    const product = await findProduct(db, slug);
    if (!product) throw new ServiceError(404, 'PRODUCT_NOT_FOUND', 'This product is unavailable.');
    const related = await listProducts(
      db,
      catalogQuerySchema.parse({ category: product.category, pageSize: '3' }),
      product.id,
    );
    return { product, related: related.data };
  });
