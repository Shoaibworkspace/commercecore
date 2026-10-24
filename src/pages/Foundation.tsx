import { useQuery } from '@tanstack/react-query';
import { getHealth } from '../lib/api';

export function Foundation() {
  const health = useQuery({ queryKey: ['health'], queryFn: getHealth, retry: false });
  return (
    <main className="shell">
      <header>
        <a className="brand" href="/" aria-label="CommerceCore home">
          <span className="brand-mark">C</span> CommerceCore<span className="brand-dot">.</span>
        </a>
        <span className="badge">Engineering preview</span>
      </header>
      <section className="intro">
        <p className="eyebrow">PHASE 01 / THE FOUNDATION</p>
        <h1>
          Thoughtful commerce.
          <br />
          <span>Built on solid ground.</span>
        </h1>
        <p className="lead">
          A commerce platform designed around reliable orders, protected accounts, and inventory you
          can trust. The foundation, photo storefront and D1-backed catalog APIs are in place. Local
          customer accounts, profiles and saved addresses are implemented. Public account access
          remains gated while secure hashing is verified against the hosting CPU budget.
        </p>
        <a className="primary" href="#foundation">
          Explore the foundation <span aria-hidden="true">↘</span>
        </a>
      </section>
      <section id="foundation" className="foundation" aria-labelledby="foundation-title">
        <div className="section-heading">
          <h2 id="foundation-title">Small footprint. Serious foundations.</h2>
          <span>01 — 03</span>
        </div>
        <div className="grid">
          <article>
            <span className="number">01</span>
            <h3>One connected platform</h3>
            <p>
              React and a typed API share one origin. A simple deployment keeps the focus on product
              and engineering.
            </p>
            <div className="detail">React · TypeScript · Hono</div>
          </article>
          <article>
            <span className="number">02</span>
            <h3>Relational by design</h3>
            <p>
              Versioned migrations, integer prices, foreign keys, and stock constraints establish
              the database contract.
            </p>
            <div className="detail">Cloudflare D1 · SQLite</div>
          </article>
          <article>
            <span className="number">03</span>
            <h3>Clearly a demonstration</h3>
            <p>
              Demo checkout saves database orders with simulated payment. Administration,
              fulfillment and cancellation are implemented locally. No real money is collected.
            </p>
            <div className="detail">Demo checkout · No real charge</div>
          </article>
        </div>
      </section>
      <section className="status" aria-labelledby="status-title">
        <div>
          <p className="eyebrow">LIVE LOCAL DIAGNOSTIC</p>
          <h2 id="status-title">API connection</h2>
          <p role="status">
            {health.isPending
              ? 'Checking connection…'
              : health.isError
                ? health.error.message
                : `${health.data.service} API is online · Phase ${health.data.phase}`}
          </p>
        </div>
        <button
          className="secondary"
          disabled={health.isFetching}
          onClick={() => {
            void health.refetch();
          }}
        >
          {health.isFetching ? 'Checking…' : 'Check again'}
        </button>
      </section>
      <footer>
        <span>CommerceCore / Built with intention.</span>
        <a href="/">Explore the Phase 2 storefront →</a>
      </footer>
    </main>
  );
}
