import { Link, useSearchParams } from 'react-router';
import { useSession } from '../features/account/query';
import { useOrders } from '../features/checkout/query';
import { formatPrice } from '../features/catalog/model';
import { Icon } from '../components/Icon';

export default function Orders() {
  const session = useSession(),
    [params] = useSearchParams(),
    raw = Number(params.get('page') ?? 1),
    page = Number.isInteger(raw) && raw >= 1 && raw <= 9999 ? raw : 1,
    orders = useOrders(session.data?.user?.id, page);
  return (
    <div className="container checkout-page">
      <div className="cart-heading">
        <div>
          <p className="eyebrow">YOUR EVERYDAY, REMEMBERED</p>
          <h1>Your demo orders.</h1>
          <p>Real saved order records. No real charges.</p>
        </div>
        <Link className="text-link" to="/shop">
          Keep exploring <Icon name="arrow" />
        </Link>
      </div>
      {session.isPending && <p role="status">Connecting to your account…</p>}
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
          <h2>Your orders belong with you.</h2>
          <Link className="primary" to="/login?next=%2Forders">
            Sign in to view orders
          </Link>
        </div>
      )}
      {session.data?.user && orders.isPending && <p role="status">Finding your orders…</p>}
      {orders.isError && (
        <div role="alert">
          <p>We couldn’t load your orders.</p>
          <button
            className="secondary"
            onClick={() => {
              void orders.refetch();
            }}
          >
            Reload orders
          </button>
        </div>
      )}
      {orders.data?.data.length === 0 && (
        <div className="cart-empty">
          <h2>{page === 1 ? 'Your first good find is still ahead.' : 'No orders on this page.'}</h2>
          <p>Your completed demo checkouts will appear here.</p>
          <Link className="primary" to={page === 1 ? '/shop' : '/orders'}>
            {page === 1 ? 'Explore the collection' : 'Back to latest orders'}
          </Link>
        </div>
      )}
      {orders.data && orders.data.data.length > 0 && (
        <div className="order-list">
          {orders.data.data.map((order) => (
            <article key={order.id}>
              <div>
                <p className="eyebrow">
                  {new Date(order.createdAt * 1000).toLocaleDateString('en-IN')}
                </p>
                <h2>{order.orderNumber}</h2>
                <p>
                  {order.itemCount} {order.itemCount === 1 ? 'item' : 'items'} ·{' '}
                  <span className="order-status">{order.status.toLowerCase()}</span>
                </p>
              </div>
              <div>
                <strong>{formatPrice(order.totalMinor)}</strong>
                <p>Simulated payment · No charge</p>
                <Link className="text-link" to={`/orders/${order.id}`}>
                  View order <Icon name="arrow" />
                </Link>
              </div>
            </article>
          ))}
        </div>
      )}
      {orders.data && orders.data.meta.totalPages > 1 && (
        <nav className="order-pagination" aria-label="Order pages">
          {page > 1 && (
            <Link className="secondary" to={`/orders?page=${page - 1}`}>
              Previous
            </Link>
          )}
          <span>
            Page {page} of {orders.data.meta.totalPages}
          </span>
          {page < orders.data.meta.totalPages && (
            <Link className="secondary" to={`/orders?page=${page + 1}`}>
              Next
            </Link>
          )}
        </nav>
      )}
    </div>
  );
}
