import { z } from 'zod';
import { versionSchema } from './account.ts';
import { imagePathSchema, slugSchema } from './catalog.ts';

export const cartIdSchema = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-zA-Z0-9_-]+$/);
export const cartQuantitySchema = z.number().int().min(1).max(20);
export const addCartSchema = z
  .object({ variantId: cartIdSchema, quantity: cartQuantitySchema })
  .strict();
export const updateCartSchema = z
  .object({ quantity: cartQuantitySchema, version: versionSchema })
  .strict();
export const removeCartSchema = z.object({ version: versionSchema }).strict();
export const cartSchema = z.object({
  version: versionSchema,
  currency: z.literal('INR'),
  items: z
    .array(
      z.object({
        variantId: cartIdSchema,
        productId: z.string(),
        slug: slugSchema,
        name: z.string(),
        label: z.string(),
        image: imagePathSchema,
        quantity: cartQuantitySchema,
        stock: z.number().int().nonnegative(),
        unitPriceMinor: z.number().int().nonnegative(),
        lineTotalMinor: z.number().int().nonnegative(),
        issue: z.enum(['UNAVAILABLE', 'INSUFFICIENT_STOCK']).nullable(),
      }),
    )
    .max(50),
  itemCount: z.number().int().nonnegative(),
  subtotalMinor: z.number().int().nonnegative(),
  hasIssues: z.boolean(),
});
export const cartResponseSchema = z.object({ data: cartSchema, requestId: z.string() });
export type Cart = z.infer<typeof cartSchema>;
