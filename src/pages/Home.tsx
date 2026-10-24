import { Link } from 'react-router';
import { useProducts, useCategories } from '../features/catalog/query';
import { ProductCard } from '../components/ProductCard';
import { CatalogError, ProductSkeletons } from '../components/CatalogStates';
import { Icon } from '../components/Icon';
import { Reveal } from '../components/Reveal';

export default function Home() {
  const catalog = useProducts({ featured: true, pageSize: 4 });
  const arrivals = useProducts({ isNew: true, sort: 'newest', pageSize: 4 });
  const offers = useProducts({ onSale: true, pageSize: 4 });
  const categories = useCategories();
  return (
    <div className="editorial-home">
      <section className="editorial-hero" aria-labelledby="hero-title">
        <div className="editorial-hero-copy">
          <p className="eyebrow">THE EVERYDAY EDIT</p>
          <h1 id="hero-title">
            Good finds.
            <br />
            Better everyday.
          </h1>
          <p className="hero-description">
            Thoughtful essentials for your home, your wardrobe and everything in between.
          </p>
          <div className="hero-actions">
            <Link className="primary" to="/shop">
              Shop the collection <Icon name="arrow" />
            </Link>
            <Link className="secondary" to="/shop?sort=newest">
              Explore new arrivals
            </Link>
          </div>
          <span className="hero-footnote">A considered collection. A little more you.</span>
        </div>
        <div className="editorial-hero-photo">
          <img
            src="/images/photos/everyday-editorial.webp"
            alt="AI-generated still life of a canvas tote, cotton tee, black headphones, gold-tone necklace and ceramic cup in warm sunlight"
            width="1536"
            height="1024"
            fetchPriority="high"
          />
          <div className="hero-photo-caption">
            <span>
              Considered
              <br />
              essentials.
            </span>
            <i />
          </div>
          <span className="editorial-photo-credit">AI-generated imagery</span>
        </div>
      </section>
      <nav className="container category-ribbon" aria-label="Featured categories">
        <p>
          Made for your everyday <span aria-hidden="true" />
        </p>
        {['clothing', 'electronics', 'jewellery', 'home'].map((slug, index) => (
          <Link key={slug} to={'/categories/' + slug}>
            <span>0{index + 1}</span>
            {slug.charAt(0).toUpperCase() + slug.slice(1)}
            <Icon name="arrow" />
          </Link>
        ))}
      </nav>
      <Reveal>
        <section className="container editorial-products" aria-labelledby="featured-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">GOOD FINDS, PICKED FOR YOU</p>
              <h2 id="featured-title">Your next everyday favourite.</h2>
            </div>
            <Link className="text-link" to="/shop">
              Explore the collection <Icon name="arrow" />
            </Link>
          </div>
          {catalog.isPending ? (
            <ProductSkeletons count={4} />
          ) : catalog.isError ? (
            <CatalogError
              retry={() => {
                void catalog.refetch();
              }}
            />
          ) : (
            <div className="product-grid home-products-grid">
              {catalog.data.data.map((product) => (
                <ProductCard product={product} key={product.id} />
              ))}
            </div>
          )}
        </section>
      </Reveal>
      <Reveal>
        <section className="jewellery-edit" aria-labelledby="jewellery-title">
          <div className="jewellery-copy">
            <p className="eyebrow">THE JEWELLERY COLLECTION</p>
            <h2 id="jewellery-title">
              The little details.
              <br />A lasting impression.
            </h2>
            <p>Everyday pieces that make an outfit your own.</p>
            <Link className="text-link" to="/categories/jewellery">
              Explore jewellery <Icon name="arrow" />
            </Link>
          </div>
          <div className="jewellery-photo">
            <img
              src="/images/photos/layered-chain-necklace.webp"
              alt="AI-generated product photograph of a layered gold-tone necklace"
              width="640"
              height="640"
              loading="lazy"
            />
          </div>
        </section>
      </Reveal>
      <Reveal>
        <section className="container editorial-categories" aria-labelledby="category-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">A LITTLE OF WHAT YOU LOVE</p>
              <h2 id="category-title">Find your kind of good.</h2>
            </div>
            <Link className="text-link" to="/shop">
              Shop everything <Icon name="arrow" />
            </Link>
          </div>
          {categories.isPending && <p role="status">Loading collections…</p>}
          {categories.isError && (
            <CatalogError
              retry={() => {
                void categories.refetch();
              }}
            />
          )}
          <div className="editorial-category-grid">
            {categories.data?.map((category, index) => (
              <Link
                key={category.slug}
                to={'/categories/' + category.slug}
                className="editorial-category"
              >
                <div>
                  <img src={category.image} alt="" width="640" height="640" loading="lazy" />
                  <span>0{index + 1}</span>
                </div>
                <h3>
                  {category.name}
                  <Icon name="arrow" />
                </h3>
                <p>{category.description}</p>
              </Link>
            ))}
          </div>
        </section>
      </Reveal>
      <Reveal>
        <section className="container editorial-products" aria-labelledby="new-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">FRESH PERSPECTIVES</p>
              <h2 id="new-title">A few new favourites.</h2>
            </div>
            <Link className="text-link" to="/shop?sort=newest">
              Discover new arrivals <Icon name="arrow" />
            </Link>
          </div>
          {arrivals.isPending ? (
            <ProductSkeletons count={4} />
          ) : arrivals.isError ? (
            <CatalogError
              retry={() => {
                void arrivals.refetch();
              }}
            />
          ) : (
            <div className="product-grid home-products-grid">
              {arrivals.data.data.map((product) => (
                <ProductCard product={product} key={product.id} />
              ))}
            </div>
          )}
        </section>
      </Reveal>
      <Reveal>
        <section
          className="container editorial-products editorial-offers"
          aria-labelledby="offers-title"
        >
          <div className="section-heading">
            <div>
              <p className="eyebrow">A LITTLE MORE FOR LESS</p>
              <h2 id="offers-title">Good finds. Better prices.</h2>
            </div>
            <Link className="text-link" to="/shop?sale=1">
              Shop the offers <Icon name="arrow" />
            </Link>
          </div>
          <p className="offers-note">Sample savings, applied automatically at demo checkout.</p>
          {offers.isPending ? (
            <ProductSkeletons count={4} />
          ) : offers.isError ? (
            <CatalogError
              retry={() => {
                void offers.refetch();
              }}
            />
          ) : (
            <div className="product-grid home-products-grid">
              {offers.data.data.map((product) => (
                <ProductCard product={product} key={product.id} />
              ))}
            </div>
          )}
        </section>
      </Reveal>
      <Reveal>
        <section className="container editorial-story">
          <span className="eyebrow">THE COMMERCECORE WAY</span>
          <h2>
            Useful things.
            <br />
            <em>Beautifully considered.</em>
          </h2>
          <p>
            For getting dressed, settling in and making the everyday a little better. Explore a
            collection that brings your world together.
          </p>
          <Link className="text-link" to="/about">
            A little about us <Icon name="arrow" />
          </Link>
          <small>Sample products · AI-generated photography · No real payments</small>
        </section>
      </Reveal>
    </div>
  );
}
