import { Link, useParams } from 'react-router';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSession, accountRequest } from '../features/account/query';
import { useOrder } from '../features/checkout/query';
import { OrderTotals, DeliveryDetails } from '../components/OrderSummary';
import { formatPrice } from '../features/catalog/model';
import { ApiError } from '../lib/api';
import { Icon } from '../components/Icon';

export default function Order() {
  const cache = useQueryClient(),
    [confirm, setConfirm] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const { id } = useParams(),
    session = useSession(),
    order = useOrder(session.data?.user?.id, id);
  async function cancel() {
    if (busy || !order.data) return;
    setBusy(true);
    setError('');
    try {
      await accountRequest(
        `/api/orders/${id}/cancel`,
        'POST',
        { version: order.data.version },
        session.data?.csrfToken,
      );
      setConfirm(false);
      await cache.invalidateQueries();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not cancel this order.');
      await order.refetch();
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="container checkout-page">
      {session.isPending && <p role="status">Opening your order…</p>}
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
          <h1>Sign in to view your order.</h1>
          <Link
            className="primary"
            to={`/login?${new URLSearchParams({ next: `/orders/${id ?? ''}` })}`}
          >
            Sign in
          </Link>
        </div>
      )}
      {session.data?.user && order.isPending && <p role="status">Loading the saved order…</p>}
      {order.isError && (
        <div className="cart-empty" role="alert">
          <h1>
            {order.error instanceof ApiError && order.error.status === 404
              ? 'Order not found.'
              : 'Unable to load this order.'}
          </h1>
          <p>Only the account that placed an order can view it.</p>
          <button
            className="secondary"
            onClick={() => {
              void order.refetch();
            }}
          >
            Try again
          </button>
          <Link className="text-link" to="/orders">
            My orders
          </Link>
        </div>
      )}
      {order.data && (
        <>
          <section className="order-confirmation">
            <span className="order-check">
              <Icon name="check" />
            </span>
            <p className="eyebrow">DEMO ORDER SAVED · NO REAL CHARGE</p>
            <h1>
              {order.data.status === 'CANCELLED'
                ? 'Your order has been cancelled.'
                : order.data.status === 'DELIVERED'
                  ? 'Your demo order is delivered.'
                  : order.data.status === 'SHIPPED'
                    ? 'Your demo order is on its way.'
                    : order.data.status === 'PROCESSING'
                      ? 'Your good finds are being prepared.'
                      : 'Your good finds are confirmed.'}
            </h1>
            <p className="order-reference">{order.data.orderNumber}</p>
            <p>
              {order.data.status === 'CANCELLED'
                ? 'Stock has been restored. No real payment or refund was made.'
                : 'No money was collected and no physical delivery is scheduled.'}
            </p>
            <Link className="text-link" to="/orders">
              View all your orders <Icon name="arrow" />
            </Link>
          </section>
          <div className="checkout-layout">
            <section className="checkout-panel">
              <div className="checkout-panel-heading">
                <h2>What you picked.</h2>
                <span className="order-status">{order.data.status.toLowerCase()}</span>
              </div>
              <p className="cart-helper">
                Placed {new Date(order.data.createdAt * 1000).toLocaleString('en-IN')} · Historical
                item and price snapshots
              </p>
              <div className="checkout-quote-lines">
                {order.data.items.map((line) => (
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
              <h3>Saved delivery details</h3>
              <DeliveryDetails delivery={order.data.delivery} />
              <p className="cart-helper">
                This page shows the latest demo fulfillment status. Orders can be cancelled before
                shipping.
              </p>
              {error && (
                <p className="account-feedback error" role="alert">
                  {error}
                </p>
              )}
              {['CREATED', 'CONFIRMED', 'PROCESSING'].includes(order.data.status) && (
                <div className="admin-cancel">
                  {confirm ? (
                    <>
                      <p>
                        Cancel this demo order and return its items to stock? Cancelled orders
                        cannot be reopened.
                      </p>
                      <div className="admin-inline">
                        <button
                          className="primary"
                          disabled={busy}
                          onClick={() => {
                            void cancel();
                          }}
                        >
                          {busy ? 'Cancelling…' : 'Confirm cancellation'}
                        </button>
                        <button
                          className="secondary"
                          disabled={busy}
                          onClick={() => setConfirm(false)}
                        >
                          Keep order
                        </button>
                      </div>
                    </>
                  ) : (
                    <button className="secondary" onClick={() => setConfirm(true)}>
                      Cancel order
                    </button>
                  )}
                </div>
              )}
            </section>
            <aside className="checkout-panel">
              <p className="eyebrow">YOUR SAVED TOTALS</p>
              <h2>All accounted for.</h2>
              <OrderTotals totals={order.data} />
              <p className="cart-helper">
                Demo Checkout — No Real Charge. These totals are illustrative, not a tax invoice.
              </p>
              <Link className="primary" to="/shop">
                Continue exploring <Icon name="arrow" />
              </Link>
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
