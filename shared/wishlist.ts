import { z } from 'zod';
import { imagePathSchema, slugSchema, variantSchema } from './catalog.ts';
import { addCartSchema, cartSchema } from './cart.ts';

export const wishlistInputSchema = z.object({}).strict();
export const moveWishlistSchema = addCartSchema;
export const wishlistEntrySchema = z.object({
  productId: z.string(),
  slug: slugSchema,
  name: z.string(),
  subtitle: z.string(),
  image: imagePathSchema,
  available: z.boolean(),
  variants: z.array(variantSchema).max(20),
});
export const wishlistSchema = z.array(wishlistEntrySchema).max(50);
export const wishlistResponseSchema = z.object({ data: wishlistSchema, requestId: z.string() });
export const wishlistMoveResponseSchema = z.object({
  data: z.object({ wishlist: wishlistSchema, cart: cartSchema }),
  requestId: z.string(),
});
export type WishlistEntry = z.infer<typeof wishlistEntrySchema>;
