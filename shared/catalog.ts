import { z } from 'zod';

export const slugSchema = z
  .string()
  .min(1)
  .max(150)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
export const imagePathSchema = z
  .string()
  .max(500)
  .regex(/^\/images\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]+\.(?:webp|png|jpg|jpeg|svg)$/);
export const variantSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1).max(100),
  color: z.string().regex(/^#[0-9a-f]{6}$/i),
  priceMinor: z.number().int().min(0).max(100000000),
  compareAtMinor: z.number().int().min(1).max(100000000).nullable().optional().default(null),
  size: z.string().max(50).optional().default(''),
  stock: z.number().int().min(0).max(1000000),
  image: imagePathSchema,
  detailImage: imagePathSchema,
});
export const gallerySchema = z
  .array(
    z.object({
      image: imagePathSchema,
      alt: z.string().min(1).max(200),
      position: z.number().int().min(0).max(11).optional(),
    }),
  )
  .min(1)
  .max(12);
export const productSchema = z.object({
  id: z.string().min(1),
  slug: slugSchema,
  name: z.string().min(1).max(150),
  category: slugSchema,
  categoryName: z.string().optional(),
  description: z.string().max(10000),
  subtitle: z.string().max(200),
  material: z.string().max(1000),
  dimensions: z.string().max(500),
  care: z.string().max(2000),
  featured: z.boolean(),
  isNew: z.boolean(),
  variants: z.array(variantSchema).min(1).max(20),
  gallery: gallerySchema,
});
export const catalogSchema = z.array(productSchema);
export const categorySchema = z.object({
  id: z.string(),
  slug: slugSchema,
  name: z.string().min(1).max(100),
  description: z.string().max(2000),
  image: imagePathSchema,
});
export const paginationSchema = z.object({
  page: z.number().int().positive(),
  pageSize: z.number().int().min(1).max(24),
  total: z.number().int().nonnegative(),
  totalPages: z.number().int().positive(),
});
export const productListSchema = z.object({
  data: catalogSchema,
  meta: paginationSchema,
  requestId: z.string(),
});
export const productDetailSchema = z.object({
  data: z.object({ product: productSchema, related: catalogSchema }),
  requestId: z.string(),
});
export const categoryListSchema = z.object({
  data: z.array(categorySchema),
  requestId: z.string(),
});
export type Product = z.infer<typeof productSchema>;
export type Category = z.infer<typeof categorySchema>;
