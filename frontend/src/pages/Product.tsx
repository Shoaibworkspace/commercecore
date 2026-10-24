import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { useProduct } from '../features/catalog/query';
import { ApiError } from '../lib/api';
import type { Product as ProductType } from '../features/catalog/model';
import { CatalogError, ProductSkeletons } from '../components/CatalogStates';
import { ProductCard } from '../components/ProductCard';
import { Icon } from '../components/Icon';
import NotFound from './NotFound';
import { AddToCart } from '../components/AddToCart';
import { WishlistButton } from '../components/WishlistButton';
import { ProductPrice } from '../components/ProductPrice';

function ProductContent({ product, related }: { product: ProductType; related: ProductType[] }) {
  const [params, setParams] = useSearchParams();
  const [galleryIndex, setGalleryIndex] = useState(0);
  const variant =
    product.variants.find((item) => item.id === params.get('variant')) ?? product.variants[0]!;
  const category = { slug: product.category, name: product.categoryName ?? product.category };
  const gallery = [
    { image: variant.image, alt: `${product.name} in ${variant.label}`, zoom: false },
    {
      image: variant.detailImage,
      alt: `${product.name} in ${variant.label}, closer detail`,
      zoom: variant.image === variant.detailImage,
    },
    ...product.gallery
      .filter((item, index) => (item.position ?? index) >= 2)
      .map((item) => ({ ...item, zoom: false })),
  ];
  const heroImage = gallery[galleryIndex] ?? gallery[0]!;
  return (
    <div className="container product-page">
      <nav className="breadcrumbs" aria-label="Breadcrumb">
        <Link to="/">Home</Link>
        <span>/</span>
        <Link to={`/categories/${category.slug}`}>{category.name}</Link>
        <span>/</span>
        <span>{product.name}</span>
      </nav>
      <div className="product-detail">
        <section className="gallery" aria-label="Product gallery">
          <div className={`gallery-main ${heroImage.zoom ? 'zoomed' : ''}`}>
            <img
              src={heroImage.image}
              alt={`AI-generated product photo: ${heroImage.alt}`}
              width="640"
              height="640"
              fetchPriority="high"
            />
            {product.isNew && <span className="product-badge">New arrival</span>}
          </div>
          <div className="gallery-thumbnails">
            {gallery.map((item, index) => (
              <button
                key={`${product.id}-view-${index}`}
                className={index === galleryIndex ? 'selected' : ''}
                aria-label={`View image ${index + 1}: ${item.alt}`}
                aria-pressed={index === galleryIndex}
                onClick={() => setGalleryIndex(index)}
              >
                <img src={item.image} alt="" width="80" height="80" />
              </button>
            ))}
          </div>
          <p className="gallery-caption">AI-generated product photos · Detail view is zoomed</p>
        </section>
        <section className="product-information">
          <Link className="eyebrow" to={`/categories/${category.slug}`}>
            THE {category.name.toUpperCase()} EDIT
          </Link>
          <h1>{product.name}</h1>
          <p className="product-intro">{product.subtitle}</p>
          <fieldset className="variant-picker">
            <legend>
              {variant.size ? 'Size' : 'Option'} <span>— {variant.label}</span>
            </legend>
            <div>
              {product.variants.map((item) => (
                <button
                  className={item.id === variant.id ? 'variant-option selected' : 'variant-option'}
                  key={item.id}
                  aria-pressed={item.id === variant.id}
                  aria-label={`${item.label}${item.stock === 0 ? ', out of stock' : ''}`}
                  onClick={() => {
                    const next = new URLSearchParams(params);
                    next.set('variant', item.id);
                    setParams(next, { replace: true });
                    setGalleryIndex(0);
                  }}
                >
                  {!item.size && (
                    <svg width="24" height="24" aria-hidden="true">
                      <circle cx="12" cy="12" r="12" fill={item.color} />
                    </svg>
                  )}
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          </fieldset>
          <p className="detail-price">
            <ProductPrice variant={variant} /> <small>Illustrative price</small>
          </p>
          <AddToCart key={variant.id} product={product} variant={variant} />
          <WishlistButton productId={product.id} name={product.name} slug={product.slug} />
          <p className={`stock-label ${variant.stock === 0 ? 'unavailable' : ''}`} role="status">
            <span aria-hidden="true">●</span>
            {variant.stock === 0
              ? 'Out of stock in the sample catalog'
              : `${variant.stock <= 5 ? 'Low sample stock' : 'Available in the sample catalog'} · ${variant.stock} remaining`}
          </p>
          <p className="product-description">{product.description}</p>
          <div className="product-accordions">
            <details open>
              <summary>Details & materials</summary>
              <p>{product.material}</p>
              <p>{product.dimensions}</p>
            </details>
            <details>
              <summary>Care guide</summary>
              <p>{product.care}</p>
            </details>
            <details>
              <summary>Delivery & returns in this demo</summary>
              <p>
                This storefront does not ship physical goods or accept returns. Demo checkout uses
                saved Indian addresses, illustrative shipping/tax and simulated payment. No real
                charges.
              </p>
            </details>
          </div>
        </section>
      </div>
      <section className="section-space" id="related">
        <div className="section-heading">
          <div>
            <p className="eyebrow">A FEW GOOD COMPANIONS</p>
            <h2>Consider these, too.</h2>
          </div>
          <Link className="text-link" to={`/categories/${category.slug}`}>
            Explore {category.name.toLowerCase()} <Icon name="arrow" />
          </Link>
        </div>
        <div className="product-grid related-grid">
          {related.map((item) => (
            <ProductCard key={item.id} product={item} />
          ))}
        </div>
      </section>
    </div>
  );
}

export default function Product() {
  const { slug } = useParams();
  const catalog = useProduct(slug);
  if (catalog.isPending)
    return (
      <div className="container section-space">
        <ProductSkeletons count={2} />
      </div>
    );
  if (catalog.isError && catalog.error instanceof ApiError && catalog.error.status === 404)
    return <NotFound />;
  if (catalog.isError)
    return (
      <div className="container">
        <CatalogError
          retry={() => {
            void catalog.refetch();
          }}
        />
      </div>
    );
  const product = catalog.data?.product;
  if (!product) return <NotFound />;
  const related = catalog.data!.related;
  return <ProductContent key={product.id} product={product} related={related} />;
}
