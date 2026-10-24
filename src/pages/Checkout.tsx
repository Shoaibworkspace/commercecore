import { useEffect, useState, useRef } from 'react';
import { Link, useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import {
  DEMO_PRICING,
  quoteResponseSchema,
  orderResponseSchema,
  type Quote,
} from '../../shared/checkout.ts';
import { accountRequest, useSession, useAddresses } from '../features/account/query';
import { useCart } from '../features/cart/query';
import { AddressForm } from '../components/AddressForm';
import { OrderTotals, DeliveryDetails } from '../components/OrderSummary';
import { formatPrice } from '../features/catalog/model';
import { Icon } from '../components/Icon';

function QuoteReview({
  quote,
  pending,
  simulation,
  onSimulation,
  onPlace,
  onRefresh,
  onBack,
}: {
  quote: Quote;
  pending: boolean;
  simulation: 'success' | 'failure';
  onSimulation: (v: 'success' | 'failure') => void;
  onPlace: () => void;
  onRefresh: () => void;
  onBack: () => void;
}) {
  const [time, setTime] = useState(() => Math.floor(Date.now() / 1000));
  const reviewHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    reviewHeading.current?.focus({ preventScroll: true });
    reviewHeading.current?.scrollIntoView({ block: 'center' });
    const interval = setInterval(() => setTime(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(interval);
  }, []);
  const seconds = Math.max(0, quote.expiresAt - time);
  return (
    <div className="checkout-layout">
      <section className="checkout-panel">
        <div className="checkout-panel-heading">
          <h2 ref={reviewHeading} tabIndex={-1}>
            Review your good finds.
          </h2>
          <button className="text-button" disabled={pending} onClick={onBack}>
            Change address
          </button>
        </div>
        <div className="checkout-quote-lines">
          {quote.items.map((line) => (
            <article key={line.variantId}>
              <img
                src={line.image}
                alt={`AI-generated product photo: ${line.productName}`}
                width="90"
                height="90"
              />
              <div>
                <h3>{line.productName}</h3>
                <p>
                  {line.variantLabel} · Qty {line.quantity}
                </p>
                <p>{formatPrice(line.unitPriceMinor)} each</p>
              </div>
              <strong>{formatPrice(line.lineTotalMinor)}</strong>
            </article>
          ))}
        </div>
        <h3>Delivery address</h3>
        <DeliveryDetails delivery={quote.delivery} />
        <p className="cart-helper">
          Saved address snapshot. This demonstration does not ship physical goods.
        </p>
      </section>
      <aside className="checkout-panel checkout-review">
        <p className="eyebrow">DEMO CHECKOUT — NO REAL CHARGE</p>
        <h2>Everything, clearly.</h2>
        <OrderTotals totals={quote} />
        <p className="quote-expiry" role={seconds === 0 ? 'alert' : undefined}>
          {seconds === 0
            ? 'This summary expired. Refresh before ordering.'
            : `Summary valid for ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`}
        </p>
        <label className="demo-simulation">
          Demo payment outcome
          <select
            value={simulation}
            disabled={pending}
            onChange={(e) => onSimulation(e.target.value as 'success' | 'failure')}
          >
            <option value="success">Simulate successful payment</option>
            <option value="failure">Simulate declined payment</option>
          </select>
        </label>
        <p className="cart-helper">
          No card details or money required. A successful demo creates a saved order and reduces
          sample stock. A decline keeps your cart.
        </p>
        <button
          className="primary checkout-place"
          disabled={pending || seconds === 0}
          onClick={onPlace}
        >
          {pending ? 'Saving your demo order…' : 'Place demo order — No real charge'}{' '}
          <Icon name="arrow" />
        </button>
        <button className="text-button" disabled={pending} onClick={onRefresh}>
          Refresh order summary
        </button>
        <p className="cart-helper">
          If the connection fails, retry this order without changing the summary. The same request
          key retrieves the original result.
        </p>
      </aside>
    </div>
  );
}
export default function Checkout() {
  const session = useSession(),
    cart = useCart(session.data?.user?.id),
    addresses = useAddresses(session.data?.user?.id),
    client = useQueryClient(),
    navigate = useNavigate();
  const [selected, setSelected] = useState(''),
    [formOpen, setFormOpen] = useState(false),
    [quote, setQuote] = useState<Quote | null>(null),
    [key, setKey] = useState(''),
    [simulation, setSimulation] = useState<'success' | 'failure'>('success'),
    [pending, setPending] = useState(false),
    [error, setError] = useState('');
  const feedback = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (error) {
      feedback.current?.focus({ preventScroll: true });
      feedback.current?.scrollIntoView({ block: 'center' });
    }
  }, [error]);
  const chosen =
    addresses.data?.find((a) => a.id === selected) ??
    addresses.data?.find((a) => a.isDefault) ??
    addresses.data?.[0];
  const review = async () => {
    if (!chosen || !session.data?.user || pending) return;
    setPending(true);
    setError('');
    try {
      const current = await cart.refetch();
      if (!current.data || current.data.itemCount === 0 || current.data.hasIssues)
        throw new Error(
          'Review your cart and fix unavailable items before checkout. If you already ordered, check My orders.',
        );
      const result = quoteResponseSchema.parse(
        await accountRequest(
          '/api/checkout/quote',
          'POST',
          { addressId: chosen.id, cartVersion: current.data.version },
          session.data.csrfToken,
        ),
      ).data;
      setQuote(result);
      setKey(crypto.randomUUID());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not prepare checkout.');
    } finally {
      setPending(false);
    }
  };
  const place = async () => {
    if (!quote || !key || !session.data?.user || pending) return;
    setPending(true);
    setError('');
    try {
      const result = orderResponseSchema.parse(
        await accountRequest(
          '/api/checkout',
          'POST',
          { quoteId: quote.id, simulation },
          session.data.csrfToken,
          undefined,
          { 'Idempotency-Key': key },
        ),
      ).data;
      client.setQueryData(['order', session.data.user.id, result.id], result);
      for (const queryKey of [['cart'], ['orders'], ['products'], ['product'], ['wishlist']])
        void client.invalidateQueries({ queryKey });
      navigate(`/orders/${result.id}`, { replace: true });
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Could not retrieve the order result. Retry this same order or check My orders.',
      );
    } finally {
      setPending(false);
    }
  };
  return (
    <div className="container checkout-page">
      <div className="cart-heading">
        <div>
          <p className="eyebrow">ONE STEP CLOSER</p>
          <h1>Make it a good day.</h1>
          <p>Demo Checkout — No Real Charge</p>
        </div>
        <Link className="text-link" to="/cart">
          Back to your bag <Icon name="arrow" />
        </Link>
      </div>
      <ol className="checkout-steps" aria-label="Checkout steps">
        <li className={!quote ? 'active' : 'complete'}>
          1 <span>Delivery address</span>
        </li>
        <li className={quote ? 'active' : ''}>
          2 <span>Summary & demo payment</span>
        </li>
        <li>
          3 <span>Confirmation</span>
        </li>
      </ol>
      <p className="checkout-demo-banner">
        Sample products and Indian demo addresses only. No real payment or delivery.{' '}
        <Link to="/orders">My orders →</Link>
      </p>
      {session.isPending && <p role="status">Preparing your checkout…</p>}
      {session.isError && (
        <div role="alert">
          <p>Account connection unavailable.</p>
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
          <h2>Keep your order in one place.</h2>
          <p>Sign in to choose a saved address and try demo checkout.</p>
          <Link className="primary" to="/login?next=%2Fcheckout">
            Sign in to checkout
          </Link>
        </div>
      )}
      {error && (
        <div className="checkout-error" role="alert" ref={feedback} tabIndex={-1}>
          <p>{error}</p>
          <Link to="/cart">Review cart</Link> · <Link to="/orders">Check My orders</Link>
        </div>
      )}
      {session.data?.user && (cart.isPending || addresses.isPending) && (
        <p role="status">Loading your cart and addresses…</p>
      )}
      {session.data?.user && (cart.isError || addresses.isError) && (
        <div role="alert">
          <p>Unable to load checkout details.</p>
          <button
            className="secondary"
            onClick={() => {
              void cart.refetch();
              void addresses.refetch();
            }}
          >
            Reload checkout details
          </button>
        </div>
      )}
      {session.data?.user &&
        cart.data &&
        addresses.data &&
        !cart.isError &&
        !addresses.isError &&
        (quote ? (
          <QuoteReview
            key={quote.id}
            quote={quote}
            pending={pending}
            simulation={simulation}
            onSimulation={(v) => {
              setSimulation(v);
              setKey(crypto.randomUUID());
              setError('');
            }}
            onPlace={() => {
              void place();
            }}
            onRefresh={() => {
              void review();
            }}
            onBack={() => {
              setQuote(null);
              setError('');
            }}
          />
        ) : cart.data.itemCount === 0 ? (
          <div className="cart-empty">
            <h2>Your bag is waiting for a good find.</h2>
            <Link className="primary" to="/shop">
              Explore the collection
            </Link>
          </div>
        ) : cart.data.hasIssues ? (
          <div className="cart-empty">
            <h2>A few items need your attention.</h2>
            <p>Fix unavailable quantities or remove items before checkout.</p>
            <Link className="primary" to="/cart">
              Review your bag
            </Link>
          </div>
        ) : (
          <div className="checkout-layout">
            <section className="checkout-panel">
              <div className="checkout-panel-heading">
                <h2>Where would it go?</h2>
                <button
                  className="text-button"
                  disabled={pending}
                  onClick={() => setFormOpen(!formOpen)}
                >
                  {formOpen ? 'Close form' : 'Add address'}
                </button>
              </div>
              {addresses.data.length === 0 && !formOpen && (
                <p>Add a sample Indian delivery address to continue.</p>
              )}
              <fieldset className="checkout-addresses">
                <legend className="sr-only">Choose delivery address</legend>
                {addresses.data.map((address) => (
                  <label className={address.id === chosen?.id ? 'selected' : ''} key={address.id}>
                    <input
                      type="radio"
                      name="checkout-address"
                      value={address.id}
                      checked={address.id === chosen?.id}
                      disabled={pending}
                      onChange={() => setSelected(address.id)}
                    />
                    <div>
                      <strong>
                        {address.recipient}
                        {address.isDefault ? ' · Default' : ''}
                      </strong>
                      <p>
                        {address.line1}
                        {address.line2 ? `, ${address.line2}` : ''}
                        <br />
                        {address.city}, {address.region} {address.postalCode}
                        <br />
                        {address.phone}
                      </p>
                    </div>
                  </label>
                ))}
              </fieldset>
              {formOpen && (
                <AddressForm
                  editing={null}
                  csrfToken={session.data.csrfToken}
                  onSaved={async () => {
                    await addresses.refetch();
                  }}
                  onCancel={() => setFormOpen(false)}
                />
              )}
              <button
                className="primary"
                disabled={pending || !chosen || formOpen}
                onClick={() => {
                  void review();
                }}
              >
                {pending ? 'Calculating your summary…' : 'Review order summary'}{' '}
                <Icon name="arrow" />
              </button>
            </section>
            <aside className="checkout-panel">
              <p className="eyebrow">CLEAR FROM THE START</p>
              <h2>A thoughtful little checkout.</h2>
              <p>{cart.data.itemCount} items in your bag.</p>
              <p>
                Illustrative shipping: {formatPrice(DEMO_PRICING.shippingMinor)}, free from{' '}
                {formatPrice(DEMO_PRICING.freeShippingFromMinor)}. Demo tax is 5% of the items
                subtotal, rounded to the nearest paise.
              </p>
              <p className="cart-helper">
                Your summary is calculated on the server and is valid for 10 minutes. Stock and
                prices are checked again when the demo order is placed.
              </p>
            </aside>
          </div>
        ))}
    </div>
  );
}
