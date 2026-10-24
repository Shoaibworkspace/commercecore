import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import type { Product } from '../../../shared/catalog.ts';
import { useSession } from '../features/account/query';
import { useCartMutation } from '../features/cart/query';
import { Icon } from './Icon';
import { formatPrice } from '../features/catalog/model';

export function AddToCart({
  product,
  variant,
  compact = false,
}: {
  product: Product;
  variant: Product['variants'][number];
  compact?: boolean;
}) {
  const [quantity, setQuantity] = useState(1);
  const session = useSession(),
    mutation = useCartMutation(),
    navigate = useNavigate();
  const add = () => {
    if (!session.data?.user) {
      const next = `/products/${product.slug}?${new URLSearchParams({ variant: variant.id })}`;
      navigate(`/login?${new URLSearchParams({ next })}`);
      return;
    }
    mutation.mutate(
      { method: 'POST', variantId: variant.id, quantity },
      {
        onSuccess: () => window.dispatchEvent(new Event('commercecore:open-bag')),
      },
    );
  };
  return (
    <div className={`add-cart ${compact ? 'compact' : ''}`}>
      {compact && (
        <p className="quick-finish">
          Quick add · {variant.label} · {formatPrice(variant.priceMinor)}
        </p>
      )}
      <div className="purchase-controls">
        {!compact && (
          <label>
            Quantity
            <select
              aria-label="Quantity"
              value={quantity}
              disabled={mutation.isPending || variant.stock === 0}
              onChange={(e) => {
                setQuantity(Number(e.target.value));
                mutation.reset();
              }}
            >
              {Array.from({ length: Math.max(1, Math.min(20, variant.stock)) }, (_, i) => (
                <option key={i + 1}>{i + 1}</option>
              ))}
            </select>
          </label>
        )}
        <button
          className="primary"
          disabled={
            mutation.isPending || session.isPending || session.isError || variant.stock === 0
          }
          onClick={add}
          aria-label={`Add ${product.name} in ${variant.label} to cart`}
        >
          <Icon name="cart" />{' '}
          {variant.stock === 0 ? 'Out of stock' : mutation.isPending ? 'Adding…' : 'Add to cart'}
        </button>
      </div>
      {session.isError && (
        <p role="alert">
          Account connection unavailable.{' '}
          <button
            className="text-button"
            onClick={() => {
              void session.refetch();
            }}
          >
            Retry
          </button>
        </p>
      )}
      {mutation.isError && (
        <p className="cart-error" role="alert">
          {mutation.error.message}
        </p>
      )}
      {mutation.isSuccess && (
        <p className="cart-success" role="status">
          Added to your cart. <Link to="/cart">View cart →</Link>
        </p>
      )}
      {!compact && (
        <p className="cart-helper">
          {session.data?.user ? 'Saved to your account.' : 'Sign in to save your cart.'} Sample
          products · No real purchases.
        </p>
      )}
    </div>
  );
}
