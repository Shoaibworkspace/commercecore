import { z } from 'zod';
import { slugSchema } from '../../shared/catalog.ts';
import { ServiceError } from '../services/errors.ts';

const integer = (min: number, max: number, fallback?: number) =>
  z
    .string()
    .regex(/^\d{1,9}$/)
    .transform(Number)
    .pipe(z.number().int().min(min).max(max))
    .optional()
    .transform((value) => value ?? fallback);
export const catalogQuerySchema = z
  .object({
    q: z
      .string()
      .max(100)
      .refine((value) => new TextEncoder().encode(value).length <= 400)
      .default(''),
    category: slugSchema.optional(),
    minPrice: integer(0, 100000000),
    maxPrice: integer(0, 100000000),
    page: integer(1, 10000, 1),
    pageSize: integer(1, 24, 6),
    stock: z.enum(['0', '1']).optional(),
    sale: z.enum(['0', '1']).optional(),
    sort: z.enum(['featured', 'newest', 'price-asc', 'price-desc', 'name']).default('featured'),
    featured: z.enum(['0', '1']).optional(),
    new: z.enum(['0', '1']).optional(),
  })
  .strict()
  .refine(
    (input) =>
      input.minPrice === undefined ||
      input.maxPrice === undefined ||
      input.minPrice <= input.maxPrice,
  );
export type CatalogQuery = z.infer<typeof catalogQuerySchema>;
export function parseCatalogQuery(params: URLSearchParams): CatalogQuery {
  const values: Record<string, string> = {};
  for (const [key, value] of params) {
    if (key in values)
      throw new ServiceError(400, 'INVALID_QUERY', 'Repeated query parameters are not supported.');
    values[key] = value;
  }
  const result = catalogQuerySchema.safeParse(values);
  if (!result.success)
    throw new ServiceError(
      400,
      'INVALID_QUERY',
      'Check the search, filters and pagination parameters.',
    );
  return result.data;
}
