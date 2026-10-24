export { catalogSchema } from '../../../shared/catalog.ts';
import type { Product } from '../../../shared/catalog.ts';
export type { Product } from '../../../shared/catalog.ts';

export const categories = [
  {
    slug: 'workspace',
    name: 'Workspace',
    description: 'A little clarity for your working day.',
    image: '/images/photos/lamp-main.webp',
  },
  {
    slug: 'everyday',
    name: 'Everyday',
    description: 'Considered companions for wherever you go.',
    image: '/images/photos/tote-main.webp',
  },
  {
    slug: 'home',
    name: 'Home',
    description: 'Quiet details that make a place yours.',
    image: '/images/photos/cup-main.webp',
  },
] as const;

export type Variant = Product['variants'][number];
export const PAGE_SIZE = 6;

export function formatPrice(minor: number) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: minor % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(minor / 100);
}
export function startingPrice(product: Product) {
  return Math.min(...product.variants.map((variant) => variant.priceMinor));
}
export function discountPercent(variant: Pick<Variant, 'priceMinor' | 'compareAtMinor'>) {
  return variant.compareAtMinor && variant.compareAtMinor > variant.priceMinor
    ? Math.floor(((variant.compareAtMinor - variant.priceMinor) * 100) / variant.compareAtMinor)
    : 0;
}
export function available(product: Product) {
  return product.variants.some((variant) => variant.stock > 0);
}

export function readFilters(params: URLSearchParams, category?: string) {
  const price = (key: string) => {
    const value = params.get(key);
    return value && /^\d{1,7}$/.test(value) ? Number(value) * 100 : undefined;
  };
  const sort = params.get('sort');
  return {
    q: (params.get('q') ?? '').slice(0, 100),
    category: category ?? params.get('category') ?? '',
    min: price('min'),
    max: price('max'),
    inStock: params.get('stock') === '1',
    onSale: params.get('sale') === '1',
    sort: ['price-asc', 'price-desc', 'name', 'newest'].includes(sort ?? '') ? sort! : 'featured',
    page: /^\d{1,5}$/.test(params.get('page') ?? '') ? Math.max(1, Number(params.get('page'))) : 1,
  };
}

export function selectProducts(products: Product[], filters: ReturnType<typeof readFilters>) {
  const term = filters.q.trim().toLocaleLowerCase();
  const results = products.filter((product) => {
    // A price filter matches an actual variant, rather than the product's price range endpoints.
    const matchesPrice = product.variants.some(
      (variant) =>
        (filters.min === undefined || variant.priceMinor >= filters.min) &&
        (filters.max === undefined || variant.priceMinor <= filters.max) &&
        (!filters.inStock || variant.stock > 0) &&
        (!filters.onSale ||
          (variant.compareAtMinor !== null && variant.compareAtMinor > variant.priceMinor)),
    );
    return (
      (!filters.category || product.category === filters.category) &&
      matchesPrice &&
      (!term ||
        `${product.name} ${product.description} ${product.category} ${product.material}`
          .toLocaleLowerCase()
          .includes(term))
    );
  });
  results.sort((a, b) => {
    switch (filters.sort) {
      case 'price-asc':
        return startingPrice(a) - startingPrice(b);
      case 'price-desc':
        return startingPrice(b) - startingPrice(a);
      case 'name':
        return a.name.localeCompare(b.name);
      case 'newest':
        return Number(b.isNew) - Number(a.isNew) || a.name.localeCompare(b.name);
      default:
        return Number(b.featured) - Number(a.featured) || a.name.localeCompare(b.name);
    }
  });
  const totalPages = Math.max(1, Math.ceil(results.length / PAGE_SIZE));
  const page = Math.min(filters.page, totalPages);
  return {
    products: results.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    total: results.length,
    totalPages,
    page,
  };
}
