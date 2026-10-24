import { mutationLimit } from '../middleware/rate-limit.ts';
import { Hono } from 'hono';
import type { AppEnv } from '../types.ts';
import { requireAuth, protectMutation } from '../middleware/auth.ts';
import {
  addCartSchema,
  updateCartSchema,
  removeCartSchema,
  cartIdSchema,
} from '../../../shared/cart.ts';
import { readJSON } from '../validators/json.ts';
import { readCart, writeCart, deleteCartLine } from '../repositories/cart.ts';
import { ServiceError } from '../services/errors.ts';

export const cartRoutes = new Hono<AppEnv>();
cartRoutes.use('/cart', requireAuth, protectMutation, mutationLimit('shopping'));
cartRoutes.use('/cart/*', requireAuth, protectMutation, mutationLimit('shopping'));
cartRoutes.get('/cart', async (c) =>
  c.json({ data: await readCart(c.env.DB, c.get('auth').user.id), requestId: c.get('requestId') }),
);
cartRoutes.post('/cart/items', async (c) => {
  const input = await readJSON(c, addCartSchema);
  if (!(await writeCart(c.env.DB, c.get('auth').user.id, input.variantId, input.quantity)))
    throw new ServiceError(
      409,
      'CART_UNAVAILABLE',
      'Could not add this item. Check availability; each cart allows 50 items and up to 20 of each finish.',
    );
  return c.json({
    data: await readCart(c.env.DB, c.get('auth').user.id),
    requestId: c.get('requestId'),
  });
});
cartRoutes.put('/cart/items/:id', async (c) => {
  const input = await readJSON(c, updateCartSchema);
  if (!cartIdSchema.safeParse(c.req.param('id')).success)
    throw new ServiceError(400, 'INVALID_ID', 'Invalid variant.');
  if (
    !(await writeCart(
      c.env.DB,
      c.get('auth').user.id,
      c.req.param('id'),
      input.quantity,
      input.version,
    ))
  )
    throw new ServiceError(
      409,
      'CART_CHANGED',
      'Your cart or availability changed. Review the refreshed cart and try again.',
    );
  return c.json({
    data: await readCart(c.env.DB, c.get('auth').user.id),
    requestId: c.get('requestId'),
  });
});
cartRoutes.delete('/cart/items/:id', async (c) => {
  const input = await readJSON(c, removeCartSchema);
  if (!(await deleteCartLine(c.env.DB, c.get('auth').user.id, c.req.param('id'), input.version)))
    throw new ServiceError(
      409,
      'CART_CHANGED',
      'Your cart changed. Review the refreshed cart and try again.',
    );
  return c.json({
    data: await readCart(c.env.DB, c.get('auth').user.id),
    requestId: c.get('requestId'),
  });
});
