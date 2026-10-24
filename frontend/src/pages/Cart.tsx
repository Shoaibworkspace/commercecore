import { Link } from 'react-router';
import { useSession } from '../features/account/query';
import { useCart, useCartMutation } from '../features/cart/query';
import { formatPrice } from '../features/catalog/model';
import { Icon } from '../components/Icon';

export default function Cart() {
  const session = useSession(),
    cart = useCart(session.data?.user?.id),
    mutation = useCartMutation();
  return (
    <div className="container cart-page">
      <div className="cart-heading">
        <div>
          <p className="eyebrow">A FEW GOOD FINDS</p>
          <h1>Your shopping bag.</h1>
          <p>Thoughtful essentials, saved for you.</p>
        </div>
        <Link className="text-link" to="/shop">
          Continue shopping <Icon name="arrow" />
        </Link>
      </div>
      {session.isPending && <p role="status">Opening your bag…</p>}
      {session.isError && (
        <div role="alert">
          <p>Unable to connect to your account.</p>
          <button
            className="secondary"
            onClick={() => {
              void session.refetch();
            }}
          >
            Try again
          </button>
        </div>
      )}
      {session.data && !session.data.user && (
        <div className="cart-empty">
          <Icon name="cart" />
          <h2>A home for your good finds.</h2>
          <p>Sign in to add products and keep your bag saved across visits.</p>
          <Link className="primary" to="/login?next=%2Fcart">
            Sign in to your cart <Icon name="arrow" />
          </Link>
        </div>
      )}
      {session.data?.user && cart.isPending && <p role="status">Loading saved items…</p>}
      {cart.isError && (
        <div role="alert">
          <p>We couldn’t load your cart.</p>
          <button
            className="secondary"
            onClick={() => {
              void cart.refetch();
            }}
          >
            Reload cart
          </button>
          <Link to="/login?next=%2Fcart">Sign in again</Link>
        </div>
      )}
      {mutation.isError && (
        <p className="cart-error" role="alert">
          {mutation.error.message}
        </p>
      )}
      {cart.data && cart.data.items.length === 0 && (
        <div className="cart-empty">
          <Icon name="cart" />
          <h2>Your bag is ready for a little inspiration.</h2>
          <p>Browse the collection and add something you love.</p>
          <Link className="primary" to="/shop">
            Explore the collection <Icon name="arrow" />
          </Link>
        </div>
      )}
      {cart.data && cart.data.items.length > 0 && (
        <div className="cart-layout">
          <section aria-label="Cart items" className="cart-lines">
            <div className="cart-table-heading">
              <span>PRODUCT</span>
              <span>
                {cart.data.itemCount} {cart.data.itemCount === 1 ? 'ITEM' : 'ITEMS'}
              </span>
            </div>
            {cart.data.items.map((line) => (
              <article key={line.variantId} className="cart-line">
                <img
                  src={line.image}
                  alt={`AI-generated product photo: ${line.name} in ${line.label}`}
                  width="144"
                  height="144"
                />
                <div className="cart-line-details">
                  <p className="eyebrow">{line.label}</p>
                  <h2>
                    {line.issue === 'UNAVAILABLE' ? (
                      line.name
                    ) : (
                      <Link
                        to={`/products/${line.slug}?${new URLSearchParams({ variant: line.variantId })}`}
                      >
                        {line.name}
                      </Link>
                    )}
                  </h2>
                  <p>{formatPrice(line.unitPriceMinor)} each</p>
                  {line.issue && (
                    <p className="cart-error">
                      {line.issue === 'UNAVAILABLE'
                        ? 'This finish is no longer available. Please remove it.'
                        : `Only ${line.stock} available. Reduce the quantity or remove this item.`}
                    </p>
                  )}
                  <div className="cart-line-actions">
                    <label>
                      Qty
                      <select
                        aria-label={`Quantity for ${line.name}, ${line.label}`}
                        value={line.quantity}
                        disabled={
                          mutation.isPending ||
                          cart.isFetching ||
                          line.issue === 'UNAVAILABLE' ||
                          line.stock === 0
                        }
                        onChange={(e) =>
                          mutation.mutate({
                            method: 'PUT',
                            variantId: line.variantId,
                            quantity: Number(e.target.value),
                            version: cart.data!.version,
                          })
                        }
                      >
                        {Array.from(
                          { length: Math.max(line.quantity, Math.min(20, line.stock)) },
                          (_, i) => (
                            <option key={i + 1} disabled={i + 1 > line.stock}>
                              {i + 1}
                            </option>
                          ),
                        )}
                      </select>
                    </label>
                    <button
                      className="text-button"
                      disabled={mutation.isPending || cart.isFetching}
                      onClick={() =>
                        mutation.mutate({
                          method: 'DELETE',
                          variantId: line.variantId,
                          version: cart.data!.version,
                        })
                      }
                      aria-label={`Remove ${line.name}, ${line.label}`}
                    >
                      Remove
                    </button>
                  </div>
                </div>
                <strong className="cart-line-total">{formatPrice(line.lineTotalMinor)}</strong>
              </article>
            ))}
            <p className="cart-helper" role="status">
              {mutation.isPending
                ? 'Saving your bag…'
                : cart.isFetching
                  ? 'Checking the latest availability…'
                  : 'Your bag is saved to your account. Items are not reserved.'}
            </p>
          </section>
          <aside className="cart-summary">
            <p className="eyebrow">THE LITTLE DETAILS</p>
            <h2>Your bag, at a glance.</h2>
            <dl>
              <div>
                <dt>Items subtotal</dt>
                <dd>{formatPrice(cart.data.subtotalMinor)}</dd>
              </div>
              <div>
                <dt>Shipping & tax</dt>
                <dd>At demo checkout</dd>
              </div>
            </dl>
            {cart.data.hasIssues && (
              <p className="cart-error">
                Some items need your attention. Review availability above.
              </p>
            )}
            {!cart.data.hasIssues && (
              <Link className="primary cart-checkout-link" to="/checkout">
                Continue to demo checkout <Icon name="arrow" />
              </Link>
            )}
            <div className="cart-checkout-note">
              <Icon name="check" />
              <p>
                <strong>Demo Checkout — No Real Charge.</strong>
                <br />
                Choose an address, review server-calculated totals and try a simulated payment.
              </p>
            </div>
            <p className="cart-helper">
              Prices and stock are checked again on each visit. No real charges or physical
              deliveries.
            </p>
            <Link className="text-link" to="/shop">
              Find a few more good things <Icon name="arrow" />
            </Link>
          </aside>
        </div>
      )}
    </div>
  );
}
