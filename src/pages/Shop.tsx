import type { FormEvent } from 'react';
import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { useProducts, useCategories } from '../features/catalog/query';
import { readFilters } from '../features/catalog/model';
import { ProductCard } from '../components/ProductCard';
import { CatalogError, ProductSkeletons } from '../components/CatalogStates';
import NotFound from './NotFound';

export default function Shop() {
  const [filtersOpen, setFiltersOpen] = useState(
    () => typeof window === 'undefined' || window.matchMedia('(min-width: 761px)').matches,
  );
  const { category: slug } = useParams();
  const [params, setParams] = useSearchParams();
  const categoryQuery = useCategories();
  const categories = categoryQuery.data ?? [];
  const filters = readFilters(params, slug);
  const catalog = useProducts({ ...filters, pageSize: 12 });
  const category = categories.find((item) => item.slug === slug);
  if (slug && categoryQuery.isSuccess && !category) return <NotFound />;
  const selection = catalog.data
    ? { products: catalog.data.data, ...catalog.data.meta }
    : undefined;
  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete('page');
    setParams(next);
  };
  const applyPrices = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const min = String(values.get('min') ?? '');
    const max = String(values.get('max') ?? '');
    const maxInput = form.elements.namedItem('max') as HTMLInputElement;
    maxInput.setCustomValidity(
      min && max && Number(min) > Number(max)
        ? 'Maximum price must be at least the minimum price.'
        : '',
    );
    if (!form.reportValidity()) return;
    const next = new URLSearchParams(params);
    for (const [key, value] of [
      ['min', min],
      ['max', max],
    ]) {
      if (value) next.set(key!, value!);
      else next.delete(key!);
    }
    next.delete('page');
    setParams(next);
  };
  const reset = () => setParams({});
  const collectionParams = new URLSearchParams(params);
  collectionParams.delete('category');
  collectionParams.delete('page');
  const collectionQuery = collectionParams.size ? `?${collectionParams}` : '';
  const activeFilters = Boolean(
    filters.q ||
    (!slug && filters.category) ||
    filters.min !== undefined ||
    filters.max !== undefined ||
    filters.inStock ||
    filters.onSale,
  );
  return (
    <div className="container shop-page">
      <nav className="breadcrumbs" aria-label="Breadcrumb">
        <Link to="/">Home</Link>
        <span aria-hidden="true">/</span>
        {category ? (
          <>
            <Link to="/shop">Collection</Link>
            <span aria-hidden="true">/</span>
            <span>{category.name}</span>
          </>
        ) : (
          <span>Collection</span>
        )}
      </nav>
      <div className="collection-heading">
        <p className="eyebrow">
          {category ? `THE ${category.name.toUpperCase()} EDIT` : 'THE CONSIDERED COLLECTION'}
        </p>
        <h1>{category ? category.name : 'Good things, all together.'}</h1>
        <p>
          {category
            ? category.description
            : 'Clothing, electronics, jewellery, home favourites and everyday essentials. Find your next good thing.'}
        </p>
      </div>
      <div className="collection-layout">
        <aside className="filters" aria-label="Product filters">
          <details
            open={filtersOpen}
            onToggle={(event) => setFiltersOpen(event.currentTarget.open)}
          >
            <summary>Refine the collection</summary>
            <div className="filter-body">
              <fieldset>
                <legend>Collection</legend>
                {[{ slug: '', name: 'All products' }, ...categories].map((item) => (
                  <Link
                    className={
                      filters.category === item.slug
                        ? 'filter-category selected'
                        : 'filter-category'
                    }
                    key={item.slug}
                    to={
                      item.slug
                        ? `/categories/${item.slug}${collectionQuery}`
                        : `/shop${collectionQuery}`
                    }
                  >
                    {item.name}
                    <span aria-hidden="true">{filters.category === item.slug ? '●' : '→'}</span>
                  </Link>
                ))}
              </fieldset>
              <form onSubmit={applyPrices} key={`${params.get('min')}-${params.get('max')}`}>
                <fieldset>
                  <legend>Price range (₹)</legend>
                  <div className="price-inputs">
                    <label>
                      Minimum
                      <input
                        type="number"
                        name="min"
                        min="0"
                        max="1000000"
                        step="1"
                        placeholder="0"
                        defaultValue={params.get('min') ?? ''}
                        onInput={(event) => {
                          const form = event.currentTarget.form;
                          (
                            form?.elements.namedItem('max') as HTMLInputElement | null
                          )?.setCustomValidity('');
                        }}
                      />
                    </label>
                    <span aria-hidden="true">—</span>
                    <label>
                      Maximum
                      <input
                        type="number"
                        name="max"
                        min="0"
                        max="1000000"
                        step="1"
                        placeholder="Any"
                        defaultValue={params.get('max') ?? ''}
                        onInput={(event) => event.currentTarget.setCustomValidity('')}
                      />
                    </label>
                  </div>
                  <button className="secondary apply-price">Apply price range</button>
                </fieldset>
              </form>
              <fieldset>
                <legend>Availability</legend>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={filters.inStock}
                    onChange={(event) => update('stock', event.target.checked ? '1' : '')}
                  />
                  In stock only
                </label>
              </fieldset>
              <fieldset>
                <legend>Offers</legend>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={filters.onSale}
                    onChange={(event) => update('sale', event.target.checked ? '1' : '')}
                  />
                  On sale only
                </label>
              </fieldset>
              {activeFilters && (
                <button className="text-button" onClick={reset}>
                  Clear filters{slug ? ` in ${category?.name}` : ''}
                </button>
              )}
              <p className="filter-note">
                Sample prices and stock.
                <br />
                Save your picks and try demo checkout. No real charges.
              </p>
            </div>
          </details>
        </aside>
        <section className="collection-results" id="collection-products" aria-label="Products">
          <div className="results-toolbar">
            <p role="status">
              {selection
                ? `${selection.total} ${selection.total === 1 ? 'product' : 'products'}${filters.q ? ` for “${filters.q}”` : ''}`
                : catalog.isError
                  ? 'Collection unavailable'
                  : 'Loading collection…'}
            </p>
            <label>
              Sort by
              <select value={filters.sort} onChange={(event) => update('sort', event.target.value)}>
                <option value="featured">Featured</option>
                <option value="newest">New arrivals</option>
                <option value="price-asc">Price: low to high</option>
                <option value="price-desc">Price: high to low</option>
                <option value="name">Name: A–Z</option>
              </select>
            </label>
          </div>
          {activeFilters && (
            <div className="filter-chips">
              {filters.q && (
                <button onClick={() => update('q', '')} aria-label={`Remove search ${filters.q}`}>
                  Search: {filters.q} <span aria-hidden="true">×</span>
                </button>
              )}
              {filters.min !== undefined && (
                <button onClick={() => update('min', '')} aria-label="Remove minimum price">
                  From ₹{filters.min / 100} ×
                </button>
              )}
              {filters.max !== undefined && (
                <button onClick={() => update('max', '')} aria-label="Remove maximum price">
                  Up to ₹{filters.max / 100} ×
                </button>
              )}
              {filters.inStock && <button onClick={() => update('stock', '')}>In stock ×</button>}
              {filters.onSale && <button onClick={() => update('sale', '')}>On sale ×</button>}
            </div>
          )}
          {catalog.isPending ? (
            <ProductSkeletons count={12} />
          ) : catalog.isError ? (
            <CatalogError
              message={catalog.error.message}
              retry={() => {
                void catalog.refetch();
              }}
            />
          ) : selection && selection.total > 0 ? (
            <>
              <div className="product-grid shop-grid">
                {selection.products.map((product) => (
                  <ProductCard product={product} key={product.id} />
                ))}
              </div>
              {selection.totalPages > 1 && (
                <nav className="pagination" aria-label="Pagination">
                  {Array.from({ length: selection.totalPages }, (_, index) => {
                    const page = index + 1;
                    const next = new URLSearchParams(params);
                    next.set('page', String(page));
                    return (
                      <Link
                        key={page}
                        to={`?${next}`}
                        aria-label={`Page ${page}`}
                        aria-current={selection.page === page ? 'page' : undefined}
                      >
                        {page}
                      </Link>
                    );
                  })}
                  <span>
                    Page {selection.page} of {selection.totalPages}
                  </span>
                </nav>
              )}
            </>
          ) : (
            <div className="empty-state">
              <span className="empty-symbol" aria-hidden="true">
                ↗
              </span>
              <h2>A little too specific?</h2>
              <p>
                No sample products match these filters. Try a different search or widen the price
                range.
              </p>
              <button className="primary" onClick={reset}>
                Clear filters
              </button>
              <Link className="text-link" to="/shop">
                Browse the whole collection
              </Link>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
