import type { QueryClient } from '@tanstack/react-query';

// Refresh affected resources without refetching session/profile/address data on
// every stock or catalog save. The server remains authoritative at checkout.
export function adminInvalidationKeys(path: string): string[] {
  if (path.startsWith('/inventory/')) return ['admin', 'cart', 'wishlist', 'products', 'product'];
  if (path.startsWith('/orders/'))
    return ['admin', 'orders', 'order', 'products', 'product', 'cart', 'wishlist'];
  if (path.startsWith('/categories'))
    return ['admin', 'categories', 'products', 'product', 'wishlist'];
  return ['admin', 'products', 'product', 'categories', 'cart', 'wishlist'];
}
export async function invalidateAdminChange(cache: QueryClient, path: string) {
  const keys = adminInvalidationKeys(path);
  await cache.invalidateQueries({ predicate: (query) => keys.includes(String(query.queryKey[0])) });
}
