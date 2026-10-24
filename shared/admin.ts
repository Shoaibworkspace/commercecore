import { z } from 'zod';
import { orderSummarySchema } from './checkout.ts';
import { orderStatusSchema } from './checkout.ts';
export const adminCatalogFiltersSchema = z.object({
  q: z
    .string()
    .trim()
    .max(100)
    .refine((v) => new TextEncoder().encode(v).length <= 400)
    .default(''),
  archived: z.enum(['all', 'active', 'archived']).default('all'),
  category: z.string().max(100).default(''),
  stock: z.enum(['all', 'low']).default('all'),
});
import { gallerySchema, imagePathSchema, slugSchema } from './catalog.ts';

export const categoryInputSchema = z
  .object({
    slug: slugSchema.max(100),
    name: z.string().trim().min(1).max(100),
    description: z.string().max(2000),
    image: imagePathSchema,
  })
  .strict();
export const productInputSchema = z
  .object({
    categoryId: z.string().min(1).max(100),
    slug: slugSchema,
    name: z.string().trim().min(1).max(150),
    description: z.string().max(10000),
    subtitle: z.string().max(200),
    material: z.string().max(1000),
    dimensions: z.string().max(500),
    care: z.string().max(2000),
    featured: z.boolean(),
    isNew: z.boolean(),
  })
  .strict();
export const variantInputSchema = z
  .object({
    sku: z.string().trim().min(1).max(100),
    label: z.string().trim().min(1).max(100),
    color: z.string().regex(/^#[0-9a-f]{6}$/i),
    size: z.string().max(50).default(''),
    priceMinor: z.number().int().min(0).max(100000000),
    compareAtMinor: z.number().int().min(1).max(100000000).nullable().optional().default(null),
    image: imagePathSchema,
    detailImage: imagePathSchema,
    active: z.boolean().default(true),
    position: z.number().int().min(0).max(19).default(0),
  })
  .strict()
  .refine((v) => v.compareAtMinor === null || v.compareAtMinor > v.priceMinor, {
    path: ['compareAtMinor'],
    message: 'Original price must be higher than the selling price, or left blank.',
  });
export const createProductSchema = productInputSchema
  .extend({
    variants: z
      .array(variantInputSchema)
      .min(1)
      .max(20)
      .refine((items) => items.some((item) => item.active)),
    gallery: gallerySchema,
  })
  .strict();
export const expectedVersionSchema = z
  .number()
  .int()
  .nonnegative()
  .max(Number.MAX_SAFE_INTEGER - 1);

export const stockInputSchema = z
  .object({
    version: expectedVersionSchema,
    delta: z
      .number()
      .int()
      .min(-1000000)
      .max(1000000)
      .refine((n) => n !== 0),
    note: z.string().trim().min(3).max(500),
  })
  .strict();
export const adminCategorySchema = categoryInputSchema.extend({
  id: z.string(),
  version: expectedVersionSchema,
});
export const adminVariantSchema = variantInputSchema.safeExtend({
  id: z.string(),
  stock: z.number().int().nonnegative(),
  version: expectedVersionSchema,
  lowStockThreshold: z.number().int().nonnegative(),
});
export const adminProductSchema = productInputSchema.extend({
  id: z.string(),
  version: expectedVersionSchema,
  archived: z.boolean(),
  variants: z.array(adminVariantSchema).max(20),
  gallery: gallerySchema,
});
export const adminProductSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  category: z.string(),
  archived: z.boolean(),
  version: expectedVersionSchema,
  image: imagePathSchema,
  stock: z.number(),
  variantCount: z.number(),
});
export const pageMetaSchema = z.object({
  page: z.number(),
  total: z.number(),
  totalPages: z.number(),
});
export const adminProductsResponseSchema = z.object({
  data: z.array(adminProductSummarySchema).max(20),
  meta: pageMetaSchema,
});
export const adminCategoriesResponseSchema = z.object({
  data: z.array(adminCategorySchema).max(100),
});
export const adminProductResponseSchema = z.object({ data: adminProductSchema });
export const adminOrdersResponseSchema = z.object({
  data: z.array(orderSummarySchema).max(20),
  meta: pageMetaSchema,
});
export const movementSchema = z.object({
  id: z.string(),
  sku: z.string(),
  product: z.string(),
  variant: z.string(),
  delta: z.number(),
  reason: z.string(),
  note: z.string(),
  orderNumber: z.string().nullable(),
  createdAt: z.number(),
  actor: z.string().nullable(),
});
export const movementsResponseSchema = z.object({
  data: z.array(movementSchema).max(20),
  meta: pageMetaSchema,
});
export const auditRowSchema = z.object({
  id: z.string(),
  actor: z.string().nullable(),
  action: z.string(),
  entity: z.string(),
  entityId: z.string(),
  requestId: z.string(),
  createdAt: z.number(),
});
export const auditResponseSchema = z.object({
  data: z.array(auditRowSchema).max(20),
  meta: pageMetaSchema,
});
export const analyticsSchema = z.object({
  activeProducts: z.number(),
  customers: z.number(),
  orders: z.number(),
  openOrders: z.number(),
  cancelledOrders: z.number(),
  productsSold: z.number().int().nonnegative(),
  ordersByStatus: z
    .array(z.object({ status: orderStatusSchema, count: z.number().int().nonnegative() }))
    .max(6),
  recentOrders: z
    .array(
      z.object({
        id: z.string(),
        orderNumber: z.string(),
        status: orderStatusSchema,
        totalMinor: z.number().int().nonnegative(),
        createdAt: z.number().int(),
      }),
    )
    .max(5),
  grossMinor: z.number(),
  cancelledMinor: z.number(),
  netMinor: z.number(),
  lowStock: z
    .array(z.object({ id: z.string(), sku: z.string(), product: z.string(), stock: z.number() }))
    .max(10),
  daily: z.array(z.object({ day: z.string(), orders: z.number(), totalMinor: z.number() })).max(30),
  topProducts: z
    .array(z.object({ name: z.string(), units: z.number(), totalMinor: z.number() }))
    .max(5),
});
export const analyticsResponseSchema = z.object({ data: analyticsSchema });
export type AdminProduct = z.infer<typeof adminProductSchema>;
export type AdminCategory = z.infer<typeof adminCategorySchema>;
export type AdminVariant = z.infer<typeof adminVariantSchema>;
