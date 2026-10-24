import { Link } from 'react-router';
export default function About() {
  return (
    <div className="container about-page">
      <p className="eyebrow">BEHIND THE PROJECT</p>
      <h1>
        Thoughtfully built.
        <br />
        <em>Clearly a demonstration.</em>
      </h1>
      <p className="about-lead">
        CommerceCore is a portfolio project exploring the design and engineering of a reliable
        commerce platform. Demo accounts, saved addresses, wishlist and a persistent shopping bag
        connect to the database-backed storefront.
      </p>
      <div className="about-grid">
        <section>
          <span className="eyebrow">WORKING TODAY</span>
          <h2>A collection you can explore.</h2>
          <p>
            Explore 100 sample products across clothing, electronics, jewellery, footwear, home,
            everyday accessories and workspace. Search by name or material, filter prices, offers
            and stock, sort and paginate database results, and inspect product galleries and
            variants. Links and filters are shareable. Light and dark themes remember your
            preference. Register or sign in to manage your demo profile and Indian delivery
            addresses. Add a chosen size or finish to your cart, change quantities and keep your bag
            saved across visits. Save favorite products to your wishlist and move a chosen finish
            into your cart. Demo checkout calculates totals on the server, creates saved orders and
            updates sample inventory atomically. Cancel an order before shipping; its stock is
            restored once. Administrators can manage products, categories, inventory and demo
            fulfillment, and inspect database-backed analytics and audit history.
          </p>
        </section>
        <section>
          <span className="eyebrow">COMING IN LATER PHASES</span>
          <h2>The commerce behind the scenes.</h2>
          <p>
            Email verification, account recovery and public deployment verification follow the
            documented roadmap. Current testing and performance evidence is recorded with the
            project.
          </p>
        </section>
        <section>
          <span className="eyebrow">SAMPLE GOODS, ORIGINAL PHOTOS</span>
          <h2>An honest product preview.</h2>
          <p>
            All products, prices, materials, stock quantities, and delivery details are
            illustrative. Product and lifestyle images are original AI-generated photographs made
            for this project, optimized and bundled locally. They depict sample goods, not verified
            physical inventory. No third-party product photography is used.
          </p>
        </section>
        <section>
          <span className="eyebrow">NO REAL MONEY</span>
          <h2>Always a demonstration.</h2>
          <p>
            Checkout is labeled “Demo Checkout — No Real Charge”. It saves demonstration orders and
            sample inventory changes, never requests card numbers and never collects money.
          </p>
        </section>
      </div>
      <div className="about-actions">
        <Link className="primary" to="/shop">
          Back to the collection
        </Link>
        <Link className="text-link" to="/engineering">
          Inspect the engineering foundation →
        </Link>
      </div>
    </div>
  );
}
