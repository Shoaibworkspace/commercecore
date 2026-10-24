import { z } from 'zod';
import { addressSchema, versionSchema } from './account.ts';
import { cartIdSchema, cartQuantitySchema } from './cart.ts';
import { imagePathSchema } from './catalog.ts';

export const DEMO_PRICING = {
  version: 'demo-2026-v1',
  shippingMinor: 7900,
  freeShippingFromMinor: 250000,
  taxBasisPoints: 500,
  quoteSeconds: 600,
} as const;
export function demoTotals(subtotalMinor: number) {
  const shippingMinor =
    subtotalMinor >= DEMO_PRICING.freeShippingFromMinor ? 0 : DEMO_PRICING.shippingMinor;
  const taxMinor = Math.round((subtotalMinor * DEMO_PRICING.taxBasisPoints) / 10000);
  return {
    subtotalMinor,
    shippingMinor,
    taxMinor,
    totalMinor: subtotalMinor + shippingMinor + taxMinor,
  };
}
export const deliverySchema = addressSchema.omit({ id: true, isDefault: true, version: true });
export const orderLineSchema = z.object({
  variantId: cartIdSchema,
  productName: z.string(),
  variantLabel: z.string(),
  sku: z.string(),
  image: imagePathSchema,
  quantity: cartQuantitySchema,
  unitPriceMinor: z.number().int().nonnegative(),
  lineTotalMinor: z.number().int().nonnegative(),
});
const money = z.number().int().min(0).max(1000000000000);
export const totalsSchema = z.object({
  subtotalMinor: money,
  shippingMinor: money,
  taxMinor: money,
  totalMinor: money,
});
export const quoteInputSchema = z
  .object({ addressId: cartIdSchema, cartVersion: versionSchema })
  .strict();
export const checkoutInputSchema = z
  .object({ quoteId: z.string().uuid(), simulation: z.enum(['success', 'failure']) })
  .strict();
export const idempotencyKeySchema = z.string().regex(/^[a-zA-Z0-9_-]{16,128}$/);
export const quoteSchema = totalsSchema.extend({
  id: z.string().uuid(),
  currency: z.literal('INR'),
  cartVersion: versionSchema,
  expiresAt: z.number().int(),
  pricingVersion: z.string(),
  delivery: deliverySchema,
  items: z.array(orderLineSchema).min(1).max(50),
});
export const quoteResponseSchema = z.object({ data: quoteSchema, requestId: z.string() });
export const orderStatusSchema = z.enum([
  'CREATED',
  'CONFIRMED',
  'PROCESSING',
  'SHIPPED',
  'DELIVERED',
  'CANCELLED',
]);
export const orderSummarySchema = z.object({
  id: z.string(),
  orderNumber: z.string(),
  status: orderStatusSchema,
  paymentMode: z.literal('demo'),
  paymentStatus: z.enum(['SIMULATED_SUCCESS', 'SIMULATED_FAILURE']),
  currency: z.literal('INR'),
  totalMinor: money,
  itemCount: z.number().int().positive(),
  createdAt: z.number().int(),
});
export const orderSchema = orderSummarySchema.extend({
  ...totalsSchema.shape,
  version: versionSchema,
  delivery: deliverySchema,
  items: z.array(orderLineSchema).min(1).max(50),
});
export const orderResponseSchema = z.object({
  data: orderSchema,
  requestId: z.string(),
  replayed: z.boolean().optional(),
});
export const orderListResponseSchema = z.object({
  data: z.array(orderSummarySchema).max(10),
  meta: z.object({
    page: z.number().int().positive(),
    total: z.number().int().nonnegative(),
    totalPages: z.number().int().positive(),
  }),
  requestId: z.string(),
});
export type Quote = z.infer<typeof quoteSchema>;
export type Order = z.infer<typeof orderSchema>;
