import { useState } from 'react';
import { Link } from 'react-router';
import type { WishlistEntry } from '../../shared/wishlist.ts';
import { useSession } from '../features/account/query';
import { useWishlist, useWishlistMutation } from '../features/wishlist/query';
import { ProductPrice } from '../components/ProductPrice';
import { Icon } from '../components/Icon';

function WishlistCard({
  entry,
  pending,
  onRemove,
  onMove,
}: {
  entry: WishlistEntry;
  pending: boolean;
  onRemove: () => void;
  onMove: (variantId: string, quantity: number) => void;
}) {
  const [variantId, setVariantId] = useState(
      (entry.variants.find((v) => v.stock > 0) ?? entry.variants[0])?.id ?? '',
    ),
    [quantity, setQuantity] = useState(1);
  const variant = entry.variants.find((v) => v.id === variantId) ?? entry.variants[0];
  const disabled = !entry.available || !variant || variant.stock === 0;
  const safeQuantity = Math.min(quantity, Math.max(1, Math.min(20, variant?.stock ?? 0)));
  return (
    <article className="wishlist-card">
      {entry.available ? (
        <Link className="wishlist-photo" to={`/products/${entry.slug}`}>
          <img
            src={variant?.image ?? entry.image}
            alt={`AI-generated product photo: ${entry.name}`}
            width="640"
            height="640"
          />
        </Link>
      ) : (
        <img
          className="wishlist-photo"
          src={entry.image}
          alt={`AI-generated product photo: ${entry.name}`}
          width="640"
          height="640"
        />
      )}
      <div className="wishlist-card-body">
        <p className="eyebrow">SAVED FOR ANOTHER DAY</p>
        <h2>
          {entry.available ? <Link to={`/products/${entry.slug}`}>{entry.name}</Link> : entry.name}
        </h2>
        <p className="wishlist-subtitle">{entry.subtitle}</p>
        {variant && (
          <p className="wishlist-price">
            <ProductPrice variant={variant} />
          </p>
        )}
        {entry.available && variant && (
          <div className="wishlist-options">
            <label>
              {variant.size ? 'Size' : 'Option'}
              <select
                aria-label={`${variant.size ? 'Size' : 'Option'} for ${entry.name}`}
                value={variant.id}
                disabled={pending}
                onChange={(e) => {
                  setVariantId(e.target.value);
                  setQuantity(1);
                }}
              >
                {entry.variants.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.label}
                    {v.stock === 0 ? ' · Out of stock' : ''}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Qty
              <select
                aria-label={`Quantity for ${entry.name}`}
                value={safeQuantity}
                disabled={pending || disabled}
                onChange={(e) => setQuantity(Number(e.target.value))}
              >
                {Array.from({ length: Math.max(1, Math.min(20, variant.stock)) }, (_, i) => (
                  <option key={i + 1}>{i + 1}</option>
                ))}
              </select>
            </label>
          </div>
        )}
        <button
          className="primary wishlist-move"
          disabled={pending || disabled}
          onClick={() => {
            if (variant) onMove(variant.id, safeQuantity);
          }}
        >
          <Icon name="cart" />
          {!entry.available ? 'Product unavailable' : disabled ? 'Out of stock' : 'Move to cart'}
        </button>
        <button
          className="text-button wishlist-remove"
          aria-label={`Remove ${entry.name} from wishlist`}
          disabled={pending}
          onClick={onRemove}
        >
          Remove from wishlist
        </button>
      </div>
    </article>
  );
}
export default function Wishlist() {
  const session = useSession(),
    wishlist = useWishlist(session.data?.user?.id),
    mutation = useWishlistMutation();
  return (
    <div className="container wishlist-page">
      <div className="cart-heading">
        <div>
          <p className="eyebrow">KEEP THE GOOD FINDS CLOSE</p>
          <h1>Your wishlist.</h1>
          <p>A little inspiration, saved for later.</p>
        </div>
        <Link className="text-link" to="/shop">
          Explore the collection <Icon name="arrow" />
        </Link>
      </div>
      {session.isPending && <p role="status">Opening your wishlist…</p>}
      {session.isError && (
        <div role="alert">
          <p>Unable to connect to your account.</p>
          <button
            className="secondary"
            onClick={() => {
              void session.refetch();
            }}
          >
            Retry account connection
          </button>
        </div>
      )}
      {session.data && !session.data.user && (
        <div className="cart-empty">
          <Icon name="heart" />
          <h2>Good things are worth remembering.</h2>
          <p>Sign in to save your favorites and find them again on your next visit.</p>
          <Link className="primary" to="/login?next=%2Fwishlist">
            Sign in to save favorites <Icon name="arrow" />
          </Link>
        </div>
      )}
      {session.data?.user && wishlist.isPending && (
        <p role="status">Finding your saved products…</p>
      )}
      {wishlist.isError && (
        <div role="alert">
          <p>We couldn’t load your wishlist.</p>
          <button
            className="secondary"
            onClick={() => {
              void wishlist.refetch();
            }}
          >
            Reload wishlist
          </button>
          <Link to="/login?next=%2Fwishlist">Sign in again</Link>
        </div>
      )}
      {mutation.isError && (
        <p className="cart-error" role="alert">
          {mutation.error.message}
        </p>
      )}
      {mutation.isSuccess && (
        <p className="wishlist-feedback" role="status">
          {mutation.variables.action === 'move' ? (
            <>
              Moved to your cart. <Link to="/cart">View cart →</Link>
            </>
          ) : (
            'Removed from your wishlist.'
          )}
        </p>
      )}
      {mutation.isPending && <p role="status">Updating your saved finds…</p>}
      {wishlist.data?.length === 0 && (
        <div className="cart-empty">
          <Icon name="heart" />
          <h2>Make room for your next favorite.</h2>
          <p>Tap the heart on a product to keep it here.</p>
          <Link className="primary" to="/shop">
            Find your favorites <Icon name="arrow" />
          </Link>
        </div>
      )}
      {wishlist.data && wishlist.data.length > 0 && (
        <>
          <p className="wishlist-count">
            {wishlist.data.length} saved {wishlist.data.length === 1 ? 'product' : 'products'} ·
            Prices and availability may change.
          </p>
          <div className="wishlist-grid">
            {wishlist.data.map((entry) => (
              <WishlistCard
                key={entry.productId}
                entry={entry}
                pending={mutation.isPending || wishlist.isFetching}
                onRemove={() => mutation.mutate({ action: 'remove', productId: entry.productId })}
                onMove={(variantId, quantity) =>
                  mutation.mutate({
                    action: 'move',
                    productId: entry.productId,
                    variantId,
                    quantity,
                  })
                }
              />
            ))}
          </div>
          <p className="cart-helper">
            Saved to your account. Wishlist items are not reserved. Moving an item adds it to your
            cart and removes it from this list only when the move succeeds.
          </p>
        </>
      )}
    </div>
  );
}
