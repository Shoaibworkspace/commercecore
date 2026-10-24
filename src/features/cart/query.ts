import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { cartResponseSchema } from '../../../shared/cart.ts';
import { accountRequest, useSession } from '../account/query';

export function useCart(userId: string | undefined) {
  return useQuery({
    queryKey: ['cart', userId],
    enabled: Boolean(userId),
    queryFn: async ({ signal }) =>
      cartResponseSchema.parse(
        await accountRequest('/api/cart', 'GET', undefined, undefined, signal),
      ).data,
    staleTime: 0,
    retry: false,
    refetchOnWindowFocus: true,
  });
}
export function useCartMutation() {
  const session = useSession(),
    client = useQueryClient();
  return useMutation({
    mutationFn: async ({
      method,
      variantId,
      quantity,
      version,
    }: {
      method: 'POST' | 'PUT' | 'DELETE';
      variantId: string;
      quantity?: number;
      version?: number;
    }) => {
      if (!session.data?.user) throw new Error('Sign in to save items to your cart.');
      const body =
        method === 'POST'
          ? { variantId, quantity }
          : method === 'PUT'
            ? { quantity, version }
            : { version };
      const result = await accountRequest(
        `/api/cart/items${method === 'POST' ? '' : `/${encodeURIComponent(variantId)}`}`,
        method,
        body,
        session.data.csrfToken,
      );
      return { cart: cartResponseSchema.parse(result).data, userId: session.data.user.id };
    },
    onSuccess: ({ cart, userId }) => {
      client.setQueryData(['cart', userId], cart);
    },
    onSettled: () => {
      void client.invalidateQueries({ queryKey: ['cart'] });
    },
    retry: false,
  });
}
