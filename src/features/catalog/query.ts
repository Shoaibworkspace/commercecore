import { useQuery } from '@tanstack/react-query';
import {
  productListSchema,
  productDetailSchema,
  categoryListSchema,
} from '../../../shared/catalog.ts';
import { apiGet } from '../../lib/api';

type ProductQuery = {
  q?: string;
  category?: string;
  min?: number;
  max?: number;
  inStock?: boolean;
  onSale?: boolean;
  sort?: string;
  page?: number;
  pageSize?: number;
  featured?: boolean;
  isNew?: boolean;
};
export function productQueryString(input: ProductQuery) {
  const params = new URLSearchParams();
  if (input.q) params.set('q', input.q);
  if (input.category) params.set('category', input.category);
  if (input.min !== undefined) params.set('minPrice', String(input.min));
  if (input.max !== undefined) params.set('maxPrice', String(input.max));
  if (input.inStock) params.set('stock', '1');
  if (input.onSale) params.set('sale', '1');
  if (input.featured !== undefined) params.set('featured', input.featured ? '1' : '0');
  if (input.isNew !== undefined) params.set('new', input.isNew ? '1' : '0');
  if (input.sort) params.set('sort', input.sort);
  if (input.page) params.set('page', String(Math.min(input.page, 10000)));
  if (input.pageSize) params.set('pageSize', String(input.pageSize));
  return params.toString();
}
export function useProducts(input: ProductQuery) {
  const search = productQueryString(input);
  return useQuery({
    queryKey: ['products', search],
    queryFn: async ({ signal }) =>
      productListSchema.parse(await apiGet(`/api/products?${search}`, signal)),
    staleTime: 15000,
    retry: false,
  });
}
export function useProduct(slug: string | undefined) {
  return useQuery({
    queryKey: ['product', slug],
    enabled: Boolean(slug),
    queryFn: async ({ signal }) =>
      productDetailSchema.parse(await apiGet(`/api/products/${encodeURIComponent(slug!)}`, signal))
        .data,
    staleTime: 5000,
    retry: false,
  });
}
export function useCategories() {
  return useQuery({
    queryKey: ['categories'],
    queryFn: async ({ signal }) =>
      categoryListSchema.parse(await apiGet('/api/categories', signal)).data,
    staleTime: 60000,
    retry: false,
  });
}
