import { useQuery } from '@tanstack/react-query';
import { orderResponseSchema, orderListResponseSchema } from '../../../shared/checkout.ts';
import { accountRequest } from '../account/query';

export function useOrder(userId: string | undefined, id: string | undefined) {
  return useQuery({
    queryKey: ['order', userId, id],
    enabled: Boolean(userId && id),
    queryFn: async ({ signal }) =>
      orderResponseSchema.parse(
        await accountRequest(
          `/api/orders/${encodeURIComponent(id!)}`,
          'GET',
          undefined,
          undefined,
          signal,
        ),
      ).data,
    retry: false,
    staleTime: 0,
  });
}
export function useOrders(userId: string | undefined, page: number) {
  return useQuery({
    queryKey: ['orders', userId, page],
    enabled: Boolean(userId),
    queryFn: async ({ signal }) =>
      orderListResponseSchema.parse(
        await accountRequest(`/api/orders?page=${page}`, 'GET', undefined, undefined, signal),
      ),
    retry: false,
    staleTime: 0,
  });
}
