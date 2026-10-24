import { useNavigate } from 'react-router';
import { useSession } from '../features/account/query';
import { useWishlist, useWishlistMutation } from '../features/wishlist/query';
import { Icon } from './Icon';

export function WishlistButton({
  productId,
  name,
  slug,
  compact = false,
}: {
  productId: string;
  name: string;
  slug: string;
  compact?: boolean;
}) {
  const session = useSession(),
    wishlist = useWishlist(session.data?.user?.id),
    mutation = useWishlistMutation(),
    navigate = useNavigate();
  const saved = wishlist.data?.some((item) => item.productId === productId) ?? false;
  const toggle = () => {
    if (!session.data?.user) {
      navigate(`/login?${new URLSearchParams({ next: `/products/${slug}` })}`);
      return;
    }
    mutation.mutate({ action: saved ? 'remove' : 'save', productId });
  };
  return (
    <div className={compact ? 'card-wishlist' : 'product-wishlist'}>
      <button
        className={`wishlist-toggle ${saved ? 'saved' : ''}`}
        aria-label={`${saved ? 'Remove' : 'Save'} ${name} ${saved ? 'from' : 'to'} wishlist`}
        aria-pressed={saved}
        disabled={
          mutation.isPending ||
          session.isPending ||
          session.isError ||
          (Boolean(session.data?.user) && (wishlist.isPending || wishlist.isError))
        }
        onClick={toggle}
      >
        <Icon name="heart" />
        {!compact && (
          <span>
            {mutation.isPending ? 'Saving…' : saved ? 'Saved to wishlist' : 'Save to wishlist'}
          </span>
        )}
      </button>
      {(mutation.isError || wishlist.isError || session.isError) && (
        <p className="wishlist-button-error" role="alert">
          {mutation.isError ? mutation.error.message : 'Wishlist unavailable.'}{' '}
          <button
            className="text-button"
            onClick={() => {
              void session.refetch();
              if (session.data?.user) void wishlist.refetch();
            }}
          >
            Retry
          </button>
        </p>
      )}
      {!compact && mutation.isSuccess && (
        <p className="sr-only" role="status">
          {saved ? 'Saved to your wishlist.' : 'Removed from your wishlist.'}
        </p>
      )}
    </div>
  );
}
