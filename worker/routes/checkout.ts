import { mutationLimit } from '../middleware/rate-limit.ts';
import { z } from 'zod';
import { versionSchema } from '../../shared/account.ts';
import { transitionOrder } from '../services/order-management.ts';
import { Hono } from 'hono';
import type { AppEnv } from '../types.ts';
import { requireAuth, protectMutation } from '../middleware/auth.ts';
import {
  quoteInputSchema,
  checkoutInputSchema,
  idempotencyKeySchema,
} from '../../shared/checkout.ts';
import { cartIdSchema } from '../../shared/cart.ts';
import { readJSON } from '../validators/json.ts';
import { createQuote, placeOrder } from '../services/checkout.ts';
import { readOrder, listOrders } from '../repositories/checkout.ts';
import { ServiceError } from '../services/errors.ts';

export const checkoutRoutes = new Hono<AppEnv>();
checkoutRoutes.use('/checkout', requireAuth, protectMutation);
checkoutRoutes.use('/checkout/*', requireAuth, protectMutation);
checkoutRoutes.use('/orders', requireAuth);
checkoutRoutes.use('/orders/*', requireAuth, protectMutation);
checkoutRoutes.post('/checkout/quote', mutationLimit('quote'), async (c) => {
  const input = await readJSON(c, quoteInputSchema);
  return c.json({
    data: await createQuote(c.env.DB, c.get('auth').user.id, input.addressId, input.cartVersion),
    requestId: c.get('requestId'),
  });
});
checkoutRoutes.post('/checkout', mutationLimit('checkout'), async (c) => {
  if (c.env.PAYMENT_MODE !== 'demo')
    throw new ServiceError(503, 'CHECKOUT_UNAVAILABLE', 'Demo checkout is unavailable.');
  const key = idempotencyKeySchema.safeParse(c.req.header('idempotency-key'));
  if (!key.success)
    throw new ServiceError(
      400,
      'INVALID_IDEMPOTENCY_KEY',
      'Use an idempotency key of 16–128 letters, numbers, underscores or hyphens.',
    );
  const result = await placeOrder(
    c.env.DB,
    c.get('auth').user.id,
    key.data,
    await readJSON(c, checkoutInputSchema),
    c.get('requestId'),
  );
  return c.json(
    { data: result.order, replayed: result.replayed, requestId: c.get('requestId') },
    result.replayed ? 200 : 201,
  );
});
checkoutRoutes.get('/orders', async (c) => {
  const url = new URL(c.req.url),
    entries = [...url.searchParams];
  if (
    entries.length > 1 ||
    entries.some(([key]) => key !== 'page') ||
    !/^[1-9]\d{0,3}$/.test(url.searchParams.get('page') ?? '1')
  )
    throw new ServiceError(400, 'INVALID_QUERY', 'Choose an order page between 1 and 9999.');
  const result = await listOrders(
    c.env.DB.withSession('first-primary'),
    c.get('auth').user.id,
    Number(url.searchParams.get('page') ?? 1),
  );
  return c.json({ ...result, requestId: c.get('requestId') });
});
checkoutRoutes.get('/orders/:id', async (c) => {
  const id = cartIdSchema.safeParse(c.req.param('id'));
  const order = id.success
    ? await readOrder(c.env.DB.withSession('first-primary'), c.get('auth').user.id, id.data)
    : null;
  if (!order) throw new ServiceError(404, 'ORDER_NOT_FOUND', 'Order not found.');
  return c.json({ data: order, requestId: c.get('requestId') });
});

checkoutRoutes.post('/orders/:id/cancel', mutationLimit('cancellation'), async (c) => {
  const input = await readJSON(c, z.object({ version: versionSchema }).strict());
  return c.json({
    data: await transitionOrder(c.env.DB, c.req.param('id'), input.version, 'CANCELLED', {
      actorId: c.get('auth').user.id,
      requestId: c.get('requestId'),
    }),
    requestId: c.get('requestId'),
  });
});
