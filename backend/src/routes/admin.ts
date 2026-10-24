import { mutationLimit } from '../middleware/rate-limit.ts';
import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../types.ts';
import { requireAuth, requireAdmin, protectMutation } from '../middleware/auth.ts';
import { readJSON } from '../validators/json.ts';
import {
  categoryInputSchema,
  productInputSchema,
  variantInputSchema,
  createProductSchema,
  expectedVersionSchema,
  stockInputSchema,
  adminCatalogFiltersSchema,
} from '../../../shared/admin.ts';
import { imagePathSchema } from '../../../shared/catalog.ts';
import { orderStatusSchema } from '../../../shared/checkout.ts';
import { catalogAssets } from '../../../shared/catalog-assets.ts';
import * as repo from '../repositories/admin.ts';
import * as catalog from '../services/catalog-management.ts';
import { readOrder } from '../repositories/checkout.ts';
import { transitionOrder } from '../services/order-management.ts';
import { ServiceError } from '../services/errors.ts';

export const adminRoutes = new Hono<AppEnv>();
adminRoutes.use('*', requireAuth, requireAdmin, protectMutation, mutationLimit('administration'));
function query(url: string, allowed: string[] = ['page']) {
  const params = new URL(url).searchParams;
  if (
    [...params.keys()].some((k) => !allowed.includes(k) || params.getAll(k).length !== 1) ||
    !/^[1-9]\d{0,3}$/.test(params.get('page') ?? '1')
  )
    throw new ServiceError(400, 'INVALID_QUERY', 'Check the page or filter.');
  return { params, page: Number(params.get('page') ?? 1) };
}
const allowedAssets = new Set<string>(catalogAssets);
function images(input: unknown): void {
  if (Array.isArray(input)) {
    input.forEach(images);
    return;
  }
  if (input && typeof input === 'object')
    for (const [key, value] of Object.entries(input)) {
      if (['image', 'detailImage'].includes(key) && !allowedAssets.has(String(value)))
        throw new ServiceError(400, 'UNKNOWN_IMAGE', 'Choose a bundled catalog image.');
      if (typeof value === 'object') images(value);
    }
}
const versionSchema = expectedVersionSchema;
adminRoutes.get('/status', (c) =>
  c.json({
    data: { role: 'admin', catalogManagement: 'enabled', dashboardPhase: 7 },
    requestId: c.get('requestId'),
  }),
);
adminRoutes.get('/categories', async (c) =>
  c.json({ data: await repo.categories(c.env.DB), requestId: c.get('requestId') }),
);
adminRoutes.get('/products', async (c) => {
  const { page, params } = query(c.req.url, ['page', 'q', 'archived', 'category', 'stock']);
  const filters = adminCatalogFiltersSchema.safeParse(
    Object.fromEntries([...params].filter(([key]) => key !== 'page')),
  );
  if (!filters.success)
    throw new ServiceError(
      400,
      'INVALID_QUERY',
      'Check the search, category, visibility or stock filter.',
    );
  return c.json({
    ...(await repo.products(c.env.DB, page, filters.data)),
    requestId: c.get('requestId'),
  });
});
adminRoutes.get('/products/:id', async (c) => {
  const item = await repo.product(c.env.DB, c.req.param('id'));
  if (!item) throw new ServiceError(404, 'PRODUCT_NOT_FOUND', 'Product not found.');
  return c.json({ data: item, requestId: c.get('requestId') });
});
adminRoutes.get('/inventory/movements', async (c) =>
  c.json({
    ...(await repo.movements(c.env.DB, query(c.req.url).page)),
    requestId: c.get('requestId'),
  }),
);
adminRoutes.get('/audit', async (c) =>
  c.json({ ...(await repo.audit(c.env.DB, query(c.req.url).page)), requestId: c.get('requestId') }),
);
adminRoutes.get('/analytics', async (c) => {
  const { params } = query(c.req.url, ['days']);
  if (!['7', '30'].includes(params.get('days') ?? '7'))
    throw new ServiceError(400, 'INVALID_QUERY', 'Choose 7 or 30 days.');
  return c.json({
    data: await repo.analytics(c.env.DB, Number(params.get('days') ?? 7)),
    requestId: c.get('requestId'),
  });
});
adminRoutes.get('/orders', async (c) => {
  const { page, params } = query(c.req.url, ['page', 'status']),
    status = params.get('status');
  if (status && !orderStatusSchema.safeParse(status).success)
    throw new ServiceError(400, 'INVALID_QUERY', 'Choose a valid order status.');
  const row = await c.env.DB.prepare(
    `WITH filtered AS(SELECT o.id,o.order_number AS orderNumber,o.status,o.payment_mode AS paymentMode,
    o.payment_status AS paymentStatus,o.currency,o.total_minor AS totalMinor,o.created_at AS createdAt,
    (SELECT coalesce(sum(quantity),0) FROM order_items WHERE order_id=o.id) AS itemCount FROM orders o WHERE (?1 IS NULL OR o.status=?1)),
    page_rows AS(SELECT * FROM filtered ORDER BY createdAt DESC,id DESC LIMIT 20 OFFSET ?2)
    SELECT (SELECT count(*) FROM filtered) AS total,(SELECT json_group_array(json_object('id',id,'orderNumber',orderNumber,'status',status,
      'paymentMode',paymentMode,'paymentStatus',paymentStatus,'currency',currency,'totalMinor',totalMinor,'createdAt',createdAt,'itemCount',itemCount)) FROM page_rows) AS items`,
  )
    .bind(status, (page - 1) * 20)
    .first<{ total: number; items: string }>();
  return c.json({
    data: JSON.parse(row!.items),
    meta: { page, total: row!.total, totalPages: Math.max(1, Math.ceil(row!.total / 20)) },
    requestId: c.get('requestId'),
  });
});
adminRoutes.get('/orders/:id', async (c) => {
  const owned = await c.env.DB.prepare('SELECT user_id FROM orders WHERE id=?')
    .bind(c.req.param('id'))
    .first<{ user_id: string }>();
  if (!owned) throw new ServiceError(404, 'ORDER_NOT_FOUND', 'Order not found.');
  return c.json({
    data: await readOrder(c.env.DB, owned.user_id, c.req.param('id')),
    requestId: c.get('requestId'),
  });
});
adminRoutes.patch('/orders/:id/status', async (c) => {
  const input = await readJSON(
    c,
    z.object({ version: versionSchema, status: orderStatusSchema }).strict(),
  );
  return c.json({
    data: await transitionOrder(
      c.env.DB,
      c.req.param('id'),
      input.version,
      input.status,
      { actorId: c.get('auth').user.id, requestId: c.get('requestId') },
      true,
    ),
    requestId: c.get('requestId'),
  });
});
adminRoutes.post('/inventory/:id/adjust', async (c) => {
  const input = await readJSON(c, stockInputSchema);
  return c.json({
    data: await repo.adjustStock(c.env.DB, c.req.param('id'), input, {
      actorId: c.get('auth').user.id,
      requestId: c.get('requestId'),
    }),
    requestId: c.get('requestId'),
  });
});
adminRoutes.post('/categories', async (c) => {
  const input = await readJSON(c, categoryInputSchema);
  images(input);
  return c.json(
    {
      data: await catalog.createCategory(c.env.DB, input, {
        actorId: c.get('auth').user.id,
        requestId: c.get('requestId'),
      }),
      requestId: c.get('requestId'),
    },
    201,
  );
});
adminRoutes.patch('/categories/:id', async (c) => {
  const { version, ...input } = await readJSON(
    c,
    categoryInputSchema.extend({ version: versionSchema }).strict(),
  );
  images(input);
  return c.json({
    data: await catalog.updateCategory(c.env.DB, c.req.param('id'), version, input, {
      actorId: c.get('auth').user.id,
      requestId: c.get('requestId'),
    }),
    requestId: c.get('requestId'),
  });
});
adminRoutes.post('/products', async (c) => {
  const input = await readJSON(c, createProductSchema, 32768);
  images(input);
  return c.json(
    {
      data: await catalog.createProduct(c.env.DB, input, {
        actorId: c.get('auth').user.id,
        requestId: c.get('requestId'),
      }),
      requestId: c.get('requestId'),
    },
    201,
  );
});
adminRoutes.patch('/products/:id', async (c) => {
  const { version, ...input } = await readJSON(
    c,
    productInputSchema.extend({ version: versionSchema }).strict(),
    32768,
  );
  return c.json({
    data: await catalog.updateProduct(c.env.DB, c.req.param('id'), version, input, {
      actorId: c.get('auth').user.id,
      requestId: c.get('requestId'),
    }),
    requestId: c.get('requestId'),
  });
});
adminRoutes.patch('/products/:id/archive', async (c) => {
  const input = await readJSON(
    c,
    z.object({ version: versionSchema, archived: z.boolean() }).strict(),
  );
  return c.json({
    data: await catalog.archiveProduct(c.env.DB, c.req.param('id'), input.version, input.archived, {
      actorId: c.get('auth').user.id,
      requestId: c.get('requestId'),
    }),
    requestId: c.get('requestId'),
  });
});
adminRoutes.post('/products/:id/variants', async (c) => {
  const input = await readJSON(c, variantInputSchema);
  images(input);
  return c.json(
    {
      data: await catalog.createVariant(c.env.DB, c.req.param('id'), input, {
        actorId: c.get('auth').user.id,
        requestId: c.get('requestId'),
      }),
      requestId: c.get('requestId'),
    },
    201,
  );
});
adminRoutes.patch('/variants/:id', async (c) => {
  const { version, ...input } = await readJSON(
    c,
    variantInputSchema.safeExtend({ version: versionSchema }).strict(),
  );
  images(input);
  return c.json({
    data: await catalog.updateVariant(c.env.DB, c.req.param('id'), version, input, {
      actorId: c.get('auth').user.id,
      requestId: c.get('requestId'),
    }),
    requestId: c.get('requestId'),
  });
});
adminRoutes.put('/products/:id/images/:position', async (c) => {
  if (!/^(?:[0-9]|1[01])$/.test(c.req.param('position')))
    throw new ServiceError(400, 'INVALID_POSITION', 'Choose a gallery position from 0 to 11.');
  const { version, ...input } = await readJSON(
    c,
    z
      .object({
        version: versionSchema,
        image: imagePathSchema,
        alt: z.string().trim().min(1).max(200),
      })
      .strict(),
  );
  images(input);
  return c.json({
    data: await catalog.setProductImage(
      c.env.DB,
      c.req.param('id'),
      Number(c.req.param('position')),
      input,
      { actorId: c.get('auth').user.id, requestId: c.get('requestId') },
      version,
    ),
    requestId: c.get('requestId'),
  });
});
