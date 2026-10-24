import { formatPrice, discountPercent } from '../features/catalog/model';
import type { Variant } from '../features/catalog/model';

export function ProductPrice({ variant }: { variant: Variant }) {
  const discount = discountPercent(variant);
  return (
    <span className="price-display">
      <span className="selling-price">{formatPrice(variant.priceMinor)}</span>
      {variant.compareAtMinor !== null && variant.compareAtMinor > variant.priceMinor && (
        <>
          <del>
            <span className="sr-only">Original price </span>
            {formatPrice(variant.compareAtMinor!)}
          </del>
          <span className="price-saving">{discount > 0 ? `${discount}% off` : 'On sale'}</span>
        </>
      )}
    </span>
  );
}
