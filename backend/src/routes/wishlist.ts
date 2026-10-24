import { mutationLimit } from '../middleware/rate-limit.ts';
import { Hono } from 'hono';
import type { AppEnv } from '../types.ts';
import { requireAuth, protectMutation } from '../middleware/auth.ts';
import { cartIdSchema } from '../../../shared/cart.ts';
import { wishlistInputSchema, moveWishlistSchema } from '../../../shared/wishlist.ts';
import { readJSON } from '../validators/json.ts';
import * as wishlist from '../repositories/wishlist.ts';
import { readCart } from '../repositories/cart.ts';
import { ServiceError } from '../services/errors.ts';

export const wishlistRoutes = new Hono<AppEnv>();
wishlistRoutes.use('/wishlist', requireAuth, protectMutation, mutationLimit('shopping'));
wishlistRoutes.use('/wishlist/*', requireAuth, protectMutation, mutationLimit('shopping'));
wishlistRoutes.get('/wishlist', async (c) =>
  c.json({
    data: await wishlist.readWishlist(c.env.DB, c.get('auth').user.id),
    requestId: c.get('requestId'),
  }),
);
wishlistRoutes.use('/wishlist/items/:id/*', async (c, next) => {
  if (!cartIdSchema.safeParse(c.req.param('id')).success)
    throw new ServiceError(400, 'INVALID_ID', 'Invalid product.');
  await next();
});
wishlistRoutes.put('/wishlist/items/:id', async (c) => {
  await readJSON(c, wishlistInputSchema);
  const id = cartIdSchema.safeParse(c.req.param('id'));
  if (!id.success) throw new ServiceError(400, 'INVALID_ID', 'Invalid product.');
  if (!(await wishlist.saveWishlist(c.env.DB, c.get('auth').user.id, id.data)))
    throw new ServiceError(
      409,
      'WISHLIST_UNAVAILABLE',
      'Could not save this product. It may be unavailable, or your wishlist has reached 50 products.',
    );
  return c.json({
    data: await wishlist.readWishlist(c.env.DB, c.get('auth').user.id),
    requestId: c.get('requestId'),
  });
});
wishlistRoutes.delete('/wishlist/items/:id', async (c) => {
  await readJSON(c, wishlistInputSchema);
  const id = cartIdSchema.safeParse(c.req.param('id'));
  if (!id.success) throw new ServiceError(400, 'INVALID_ID', 'Invalid product.');
  await wishlist.removeWishlist(c.env.DB, c.get('auth').user.id, id.data);
  return c.json({
    data: await wishlist.readWishlist(c.env.DB, c.get('auth').user.id),
    requestId: c.get('requestId'),
  });
});
wishlistRoutes.post('/wishlist/items/:id/move', async (c) => {
  const input = await readJSON(c, moveWishlistSchema),
    userId = c.get('auth').user.id;
  if (
    !(await wishlist.moveWishlist(
      c.env.DB,
      userId,
      c.req.param('id'),
      input.variantId,
      input.quantity,
    ))
  )
    throw new ServiceError(
      409,
      'WISHLIST_CHANGED',
      'Could not move this item. Review your wishlist, cart quantity and current availability, then try again.',
    );
  return c.json({
    data: {
      wishlist: await wishlist.readWishlist(c.env.DB, userId),
      cart: await readCart(c.env.DB, userId),
    },
    requestId: c.get('requestId'),
  });
});
