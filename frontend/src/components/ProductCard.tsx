import { Link } from 'react-router';
import { available, discountPercent } from '../features/catalog/model';
import type { Product } from '../features/catalog/model';
import { Icon } from './Icon';
import { AddToCart } from './AddToCart';
import { WishlistButton } from './WishlistButton';
import { ProductPrice } from './ProductPrice';

export function ProductCard({ product, eager = false }: { product: Product; eager?: boolean }) {
  const availableVariants = product.variants.filter((item) => item.stock > 0);
  const variant = (availableVariants.length ? availableVariants : product.variants).reduce(
    (a, b) => (b.priceMinor < a.priceMinor ? b : a),
  );
  const sized = product.variants.some((v) => v.size);
  const discount = discountPercent(variant);
  return (
    <article className="product-card">
      <Link
        to={`/products/${product.slug}`}
        className="product-image"
        aria-label={`View ${product.name}`}
      >
        <img
          src={variant.image}
          alt={`AI-generated product photo of ${product.name} in ${variant.label}`}
          loading={eager ? 'eager' : 'lazy'}
          width="640"
          height="640"
        />
        {(discount > 0 || product.isNew || !available(product)) && (
          <span
            className={`product-badge ${discount > 0 && available(product) ? 'sale-badge' : ''}`}
          >
            {!available(product) ? 'Out of stock' : discount > 0 ? `${discount}% off` : 'New'}
          </span>
        )}
        <span className="card-arrow">
          <Icon name="arrow" />
        </span>
      </Link>
      <WishlistButton compact productId={product.id} name={product.name} slug={product.slug} />
      <p className="product-category-label">{product.categoryName ?? product.category}</p>
      <div className="product-meta">
        <Link to={`/products/${product.slug}`}>
          <h3>{product.name}</h3>
        </Link>
        <ProductPrice variant={variant} />
      </div>
      {sized ? (
        <Link className="choose-size" to={`/products/${product.slug}`}>
          Choose size <span aria-hidden="true">→</span>
        </Link>
      ) : (
        <AddToCart compact product={product} variant={variant} />
      )}
      <div className="product-sub">
        <p>{product.subtitle}</p>
        {sized ? (
          <span className="size-count">{product.variants.length} sizes</span>
        ) : (
          <div className="swatches" aria-label={`${product.variants.length} options`}>
            {product.variants.map((item) => (
              <span className="swatch" data-color={item.label} key={item.id}>
                <svg width="10" height="10" aria-hidden="true">
                  <circle cx="5" cy="5" r="5" fill={item.color} />
                </svg>
              </span>
            ))}
          </div>
        )}
      </div>
      <Link className="product-detail-link" to={`/products/${product.slug}`}>
        View product <span aria-hidden="true">→</span>
      </Link>
    </article>
  );
}
