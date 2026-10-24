import { test } from 'node:test';
import assert from 'node:assert/strict';
import { QueryClient } from '@tanstack/react-query';
import { invalidateAdminChange } from '../src/lib/query-invalidation.ts';
test('inventory changes refresh availability without refetching private account resources', async () => {
  const cache = new QueryClient();
  const keys = [
    'admin',
    'products',
    'product',
    'cart',
    'wishlist',
    'session',
    'profile',
    'addresses',
    'orders',
    'order',
  ];
  for (const key of keys) cache.setQueryData([key, 'qa'], { example: true });
  await invalidateAdminChange(cache, '/inventory/variant/adjust');
  for (const key of ['admin', 'products', 'product', 'cart', 'wishlist'])
    assert.equal(cache.getQueryState([key, 'qa']).isInvalidated, true);
  for (const key of ['session', 'profile', 'addresses', 'orders', 'order'])
    assert.equal(cache.getQueryState([key, 'qa']).isInvalidated, false);
  await invalidateAdminChange(cache, '/orders/order/status');
  assert.equal(cache.getQueryState(['orders', 'qa']).isInvalidated, true);
  assert.equal(cache.getQueryState(['order', 'qa']).isInvalidated, true);
  cache.clear();
});
