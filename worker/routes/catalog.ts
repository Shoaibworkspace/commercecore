import { Hono } from 'hono';
import type { AppEnv } from '../types.ts';
import { slugSchema } from '../../shared/catalog.ts';
import { parseCatalogQuery } from '../validators/catalog.ts';
import { getCategories, getProduct, getProducts } from '../services/catalog.ts';
import { ServiceError } from '../services/errors.ts';

export const catalogRoutes = new Hono<AppEnv>();
catalogRoutes.get('/categories', async (c) =>
  c.json({ data: await getCategories(c.env.DB), requestId: c.get('requestId') }),
);
catalogRoutes.get('/products', async (c) => {
  const query = parseCatalogQuery(new URL(c.req.url).searchParams);
  return c.json({ ...(await getProducts(c.env.DB, query)), requestId: c.get('requestId') });
});
catalogRoutes.get('/products/:slug', async (c) => {
  const result = slugSchema.safeParse(c.req.param('slug'));
  if (!result.success)
    throw new ServiceError(404, 'PRODUCT_NOT_FOUND', 'This product is unavailable.');
  return c.json({ data: await getProduct(c.env.DB, result.data), requestId: c.get('requestId') });
});
