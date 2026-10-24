import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { wishlistResponseSchema, wishlistMoveResponseSchema } from '../../../../shared/wishlist.ts';
import { useSession, accountRequest } from '../account/query';

export function useWishlist(userId: string | undefined) {
  return useQuery({
    queryKey: ['wishlist', userId],
    enabled: Boolean(userId),
    queryFn: async ({ signal }) =>
      wishlistResponseSchema.parse(
        await accountRequest('/api/wishlist', 'GET', undefined, undefined, signal),
      ).data,
    staleTime: 0,
    retry: false,
    refetchOnWindowFocus: true,
  });
}
export function useWishlistMutation() {
  const session = useSession(),
    client = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      action: 'save' | 'remove' | 'move';
      productId: string;
      variantId?: string;
      quantity?: number;
    }) => {
      if (!session.data?.user) throw new Error('Sign in to save your wishlist.');
      const moving = input.action === 'move';
      const response = await accountRequest(
        `/api/wishlist/items/${encodeURIComponent(input.productId)}${moving ? '/move' : ''}`,
        moving ? 'POST' : input.action === 'save' ? 'PUT' : 'DELETE',
        moving ? { variantId: input.variantId, quantity: input.quantity } : {},
        session.data.csrfToken,
      );
      const result = moving
        ? wishlistMoveResponseSchema.parse(response).data
        : { wishlist: wishlistResponseSchema.parse(response).data, cart: undefined };
      return { ...result, userId: session.data.user.id };
    },
    onSuccess: ({ wishlist, cart, userId }) => {
      client.setQueryData(['wishlist', userId], wishlist);
      if (cart) client.setQueryData(['cart', userId], cart);
    },
    onSettled: () => {
      void client.invalidateQueries({ queryKey: ['wishlist'] });
      void client.invalidateQueries({ queryKey: ['cart'] });
    },
    retry: false,
  });
}
