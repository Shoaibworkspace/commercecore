import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { useSession } from '../features/account/query';
import { useAdmin, useAdminAction } from '../features/admin/query';
import {
  analyticsResponseSchema,
  adminCategoriesResponseSchema,
  adminProductsResponseSchema,
  adminProductResponseSchema,
  movementsResponseSchema,
  auditResponseSchema,
  adminOrdersResponseSchema,
} from '../../../shared/admin.ts';
import { orderResponseSchema, type Order } from '../../../shared/checkout.ts';
import {
  ProductForm,
  VariantForm,
  StockForm,
  CategoryForm,
  GalleryForm,
  ActionFeedback,
} from '../components/AdminForms';
import { DeliveryDetails, OrderTotals } from '../components/OrderSummary';
import { formatPrice } from '../features/catalog/model';
import { Icon } from '../components/Icon';
import type { UseQueryResult } from '@tanstack/react-query';

const tabs = ['Overview', 'Catalog', 'Categories', 'Inventory', 'Orders', 'Audit'] as const;
const date = (n: number) => new Date(n * 1000).toLocaleString('en-IN');
function QueryState({
  query,
}: {
  query: Pick<UseQueryResult, 'isPending' | 'isError' | 'error' | 'refetch'>;
}) {
  if (query.isPending)
    return (
      <p className="admin-loading" role="status">
        Loading saved records…
      </p>
    );
  if (query.isError)
    return (
      <div role="alert" className="account-feedback error">
        <p>{query.error?.message ?? 'Could not load records.'}</p>
        <button
          className="secondary"
          onClick={() => {
            void query.refetch();
          }}
        >
          Retry
        </button>
      </div>
    );
  return null;
}
function Pagination({
  meta,
  page,
  setPage,
}: {
  meta: { total: number; totalPages: number };
  page: number;
  setPage: (page: number) => void;
}) {
  return (
    <div className="admin-pagination">
      <span>
        {meta.total} records · Page {page} of {meta.totalPages}
      </span>
      <div>
        <button className="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>
          Previous
        </button>
        <button
          className="secondary"
          disabled={page >= meta.totalPages}
          onClick={() => setPage(page + 1)}
        >
          Next
        </button>
      </div>
    </div>
  );
}
function Overview({ userId }: { userId: string }) {
  const [days, setDays] = useState(7),
    query = useAdmin(userId, `/analytics?days=${days}`, analyticsResponseSchema),
    data = query.data?.data;
  const largest = Math.max(1, ...(data?.daily.map((d) => d.totalMinor) ?? []));
  return (
    <>
      <QueryState query={query} />
      {data && (
        <>
          <div className="admin-metrics">
            {[
              [
                'Demo order value',
                formatPrice(data.netMinor),
                'Successful orders, excluding cancellations',
              ],
              [
                'Orders to prepare',
                data.openOrders,
                `${data.orders} total · ${data.cancelledOrders} cancelled`,
              ],
              [
                'Live products',
                data.activeProducts,
                `${data.productsSold} items sold in demo orders`,
              ],
              ['Customers', data.customers, 'Registered customer accounts'],
            ].map(([label, value, note]) => (
              <article key={label} className="admin-metric">
                <p>{label}</p>
                <strong>{value}</strong>
                <span>{note}</span>
              </article>
            ))}
          </div>
          <div className="admin-dashboard-grid">
            <section className="admin-panel">
              <div className="admin-section-heading">
                <div>
                  <p className="eyebrow">ORDER ACTIVITY</p>
                  <h2>A view of your shop.</h2>
                </div>
                <label className="admin-period">
                  Period
                  <select
                    aria-label="Analytics period"
                    value={days}
                    onChange={(e) => setDays(Number(e.target.value))}
                  >
                    <option value={7}>Last 7 days</option>
                    <option value={30}>Last 30 days</option>
                  </select>
                </label>
              </div>
              <p className="cart-helper">
                Successful demo order totals by creation date, in UTC. Cancelled orders are
                excluded.
              </p>
              <div
                className="admin-chart"
                role="img"
                aria-label={`${days}-day demo order totals in UTC. Exact values appear below.`}
              >
                {data.daily.map((d) => (
                  <div
                    key={d.day}
                    title={`${d.day}: ${formatPrice(d.totalMinor)}, ${d.orders} orders`}
                  >
                    <span
                      style={{
                        height: `${d.totalMinor ? Math.max(3, (d.totalMinor / largest) * 100) : 1}%`,
                      }}
                    />
                    <small>{d.day.slice(8)}</small>
                  </div>
                ))}
              </div>
              <details className="admin-chart-data">
                <summary>View daily totals</summary>
                <div className="admin-log">
                  {data.daily.map((d) => (
                    <div key={d.day}>
                      <span>
                        {d.day} UTC · {d.orders} orders
                      </span>
                      <strong>{formatPrice(d.totalMinor)}</strong>
                    </div>
                  ))}
                </div>
              </details>
              <p className="cart-helper">
                All-time gross {formatPrice(data.grossMinor)} · Cancelled{' '}
                {formatPrice(data.cancelledMinor)}. No real payments were collected.
              </p>
            </section>
            <section className="admin-panel">
              <p className="eyebrow">KEEP AN EYE ON</p>
              <h2>Low stock.</h2>
              <p className="cart-helper">Up to 10 active variants at or below their threshold.</p>
              {data.lowStock.length ? (
                <div className="admin-log">
                  {data.lowStock.map((v) => (
                    <div key={v.id}>
                      <span>
                        <strong>{v.product}</strong>
                        <small>{v.sku}</small>
                      </span>
                      <b className="admin-stock low">{v.stock} left</b>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="admin-empty">
                  <Icon name="check" />
                  <h3>Stock looks healthy.</h3>
                  <p>No active variants are below their threshold.</p>
                </div>
              )}
            </section>
          </div>
          <div className="admin-dashboard-grid">
            <section className="admin-panel">
              <p className="eyebrow">ORDER PIPELINE</p>
              <h2>Every stage, at a glance.</h2>
              <div className="admin-log">
                {['CREATED', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED'].map(
                  (status) => (
                    <div key={status}>
                      <Link
                        className="text-link"
                        to={`/admin?${new URLSearchParams({ tab: 'orders', status })}`}
                      >
                        {status.toLowerCase()}
                      </Link>
                      <strong>
                        {data.ordersByStatus.find((row) => row.status === status)?.count ?? 0}
                      </strong>
                    </div>
                  ),
                )}
              </div>
            </section>
            <section className="admin-panel">
              <p className="eyebrow">LATEST AT THE SHOP</p>
              <h2>Recent orders.</h2>
              <div className="admin-log">
                {data.recentOrders.map((order) => (
                  <div key={order.id}>
                    <span>
                      <Link
                        className="text-link"
                        to={`/admin?${new URLSearchParams({ tab: 'orders', order: order.id })}`}
                      >
                        {order.orderNumber}
                      </Link>
                      <small>
                        {date(order.createdAt)} · {order.status.toLowerCase()}
                      </small>
                    </span>
                    <strong>{formatPrice(order.totalMinor)}</strong>
                  </div>
                ))}
              </div>
              {!data.recentOrders.length && <p className="admin-empty">No demo orders yet.</p>}
            </section>
          </div>
          <section className="admin-panel">
            <p className="eyebrow">CUSTOMER FAVOURITES</p>
            <h2>Top products.</h2>
            {data.topProducts.length ? (
              <div className="admin-log">
                {data.topProducts.map((p, i) => (
                  <div key={p.name}>
                    <span>
                      <b className="admin-rank">0{i + 1}</b>
                      {p.name}
                    </span>
                    <strong>
                      {p.units} units · {formatPrice(p.totalMinor)}
                    </strong>
                  </div>
                ))}
              </div>
            ) : (
              <p className="admin-empty">Top products will appear after a successful demo order.</p>
            )}
            <p className="cart-helper">
              All-time item value, before shipping and illustrative tax. Cancelled orders are
              excluded.
            </p>
          </section>
        </>
      )}
    </>
  );
}
function Catalog({
  userId,
  csrf,
  inventory = false,
}: {
  userId: string;
  csrf: string;
  inventory?: boolean;
}) {
  const [page, setPage] = useState(1),
    [selected, setSelected] = useState(''),
    [creating, setCreating] = useState(false),
    [adding, setAdding] = useState(false),
    [search, setSearch] = useState(''),
    [visibility, setVisibility] = useState('all'),
    [category, setCategory] = useState(''),
    [stock, setStock] = useState('all');
  const listing = useAdmin(
      userId,
      `/products?${new URLSearchParams({ page: String(page), q: search, archived: visibility, category, stock })}`,
      adminProductsResponseSchema,
    ),
    categories = useAdmin(userId, '/categories', adminCategoriesResponseSchema),
    detail = useAdmin(
      selected ? userId : undefined,
      `/products/${selected}`,
      adminProductResponseSchema,
    ),
    action = useAdminAction(csrf),
    product = detail.data?.data;
  const workspaceHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (creating || product?.id) {
      workspaceHeading.current?.scrollIntoView({ block: 'start', behavior: 'instant' });
      workspaceHeading.current?.focus({ preventScroll: true });
    }
  }, [creating, product?.id]);
  return (
    <>
      <section className="admin-panel">
        <div className="admin-section-heading">
          <div>
            <p className="eyebrow">{inventory ? 'STOCK CONTROL' : 'YOUR COLLECTION'}</p>
            <h2>{inventory ? 'Inventory.' : 'Products.'}</h2>
          </div>
          {!inventory && (
            <button
              className="primary"
              onClick={() => {
                setCreating(true);
                setSelected('');
              }}
            >
              Add product <span aria-hidden="true">+</span>
            </button>
          )}
        </div>
        <div className="admin-catalog-filters">
          <form
            className="admin-catalog-search"
            onSubmit={(event) => {
              event.preventDefault();
              setSearch(String(new FormData(event.currentTarget).get('q') ?? '').trim());
              setPage(1);
              setSelected('');
            }}
          >
            <label>
              Find a product
              <input
                type="search"
                name="q"
                maxLength={100}
                defaultValue={search}
                placeholder="Product name, slug or SKU"
              />
            </label>
            <button className="secondary">Search catalog</button>
          </form>
          <div className="admin-filter-selects">
            <label>
              Visibility
              <select
                aria-label="Product visibility"
                value={visibility}
                onChange={(event) => {
                  setVisibility(event.target.value);
                  setPage(1);
                  setSelected('');
                }}
              >
                <option value="all">All products</option>
                <option value="active">Active products</option>
                <option value="archived">Archived products</option>
              </select>
            </label>
            <label>
              Category
              <select
                aria-label="Filter category"
                value={category}
                onChange={(event) => {
                  setCategory(event.target.value);
                  setPage(1);
                  setSelected('');
                }}
              >
                <option value="">All categories</option>
                {categories.data?.data.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Stock
              <select
                aria-label="Filter stock"
                value={stock}
                onChange={(event) => {
                  setStock(event.target.value);
                  setPage(1);
                  setSelected('');
                }}
              >
                <option value="all">All stock levels</option>
                <option value="low">Low-stock variants</option>
              </select>
            </label>
          </div>
        </div>
        <QueryState query={listing} />
        {listing.data && (
          <>
            <div className="admin-product-list">
              {listing.data.data.map((p) => (
                <button
                  key={p.id}
                  className={`admin-product-row ${selected === p.id ? 'selected' : ''}`}
                  aria-pressed={selected === p.id}
                  onClick={() => {
                    setSelected(p.id);
                    setCreating(false);
                    setAdding(false);
                  }}
                >
                  <img src={p.image} alt="" width="64" height="64" />
                  <span>
                    <strong>{p.name}</strong>
                    <small>
                      {p.category} · {p.variantCount} variants{p.archived ? ' · Archived' : ''}
                    </small>
                  </span>
                  <b>
                    {p.stock}
                    <small>in stock</small>
                  </b>
                  <Icon name="arrow" />
                </button>
              ))}
            </div>
            {!listing.data.data.length && <p className="admin-empty">No products on this page.</p>}
            <Pagination meta={listing.data.meta} page={page} setPage={setPage} />
          </>
        )}
      </section>
      {creating && (
        <section className="admin-panel">
          <h2 ref={workspaceHeading} tabIndex={-1} className="admin-workspace-heading">
            New product
          </h2>
          <button className="text-link" onClick={() => setCreating(false)}>
            Close new product
          </button>
          <QueryState query={categories} />
          {categories.data && (
            <ProductForm
              categories={categories.data.data}
              csrf={csrf}
              onCreated={() => setCreating(false)}
            />
          )}
        </section>
      )}
      {selected && (
        <section className="admin-panel">
          <QueryState query={detail} />
          {product && (
            <>
              <div className="admin-section-heading">
                <div>
                  <p className="eyebrow">
                    {product.archived ? 'ARCHIVED PRODUCT' : 'PRODUCT WORKSPACE'}
                  </p>
                  <h2 ref={workspaceHeading} tabIndex={-1} className="admin-workspace-heading">
                    {product.name}
                  </h2>
                </div>
                <button className="text-link" onClick={() => setSelected('')}>
                  Close editor
                </button>
              </div>
              {inventory ? (
                <div className="admin-stock-grid">
                  {product.variants.map((v) => (
                    <StockForm key={`${v.id}-${v.version}`} variant={v} csrf={csrf} />
                  ))}
                </div>
              ) : (
                <>
                  <div className="admin-inline">
                    <Link className="text-link" to={`/products/${product.slug}`}>
                      View storefront <Icon name="arrow" />
                    </Link>
                    <button
                      className="secondary"
                      disabled={action.busy}
                      onClick={() => {
                        void action.run(`/products/${product.id}/archive`, 'PATCH', {
                          version: product.version,
                          archived: !product.archived,
                        });
                      }}
                    >
                      {product.archived ? 'Restore product' : 'Archive product'}
                    </button>
                  </div>
                  <ActionFeedback action={action} />
                  {categories.data && (
                    <ProductForm
                      key={product.version}
                      product={product}
                      categories={categories.data.data}
                      csrf={csrf}
                      onCreated={() => {}}
                    />
                  )}
                  <GalleryForm key={`gallery-${product.version}`} product={product} csrf={csrf} />
                  <div className="admin-section-heading">
                    <h3>Variants</h3>
                    {product.variants.length < 20 && (
                      <button className="secondary" onClick={() => setAdding(!adding)}>
                        {adding ? 'Close variant form' : 'Add variant'}
                      </button>
                    )}
                  </div>
                  {adding && <VariantForm productId={product.id} csrf={csrf} />}
                  <div className="admin-variant-grid">
                    {product.variants.map((v) => (
                      <details key={`${v.id}-${v.version}`} className="admin-variant">
                        <summary>
                          <img src={v.image} width="48" height="48" alt="" />
                          <span>
                            {v.label}
                            <small>
                              {v.sku} · {formatPrice(v.priceMinor)} ·{' '}
                              {v.active ? 'Active' : 'Inactive'}
                            </small>
                          </span>
                        </summary>
                        <VariantForm variant={v} productId={product.id} csrf={csrf} />
                      </details>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </section>
      )}
      {inventory && <Ledger userId={userId} />}
    </>
  );
}
function Categories({ userId, csrf }: { userId: string; csrf: string }) {
  const query = useAdmin(userId, '/categories', adminCategoriesResponseSchema),
    [selected, setSelected] = useState(''),
    [creating, setCreating] = useState(false);
  const category = query.data?.data.find((c) => c.id === selected);
  return (
    <section className="admin-panel">
      <div className="admin-section-heading">
        <div>
          <p className="eyebrow">ORGANISE THE COLLECTION</p>
          <h2>Categories.</h2>
        </div>
        <button
          className="primary"
          onClick={() => {
            setCreating(true);
            setSelected('');
          }}
        >
          Add category
        </button>
      </div>
      <QueryState query={query} />
      <div className="admin-category-grid">
        {query.data?.data.map((c) => (
          <button
            key={c.id}
            className={`admin-category ${c.id === selected ? 'selected' : ''}`}
            onClick={() => {
              setSelected(c.id);
              setCreating(false);
            }}
          >
            <img src={c.image} alt="" width="120" height="90" />
            <strong>{c.name}</strong>
            <small>/{c.slug}</small>
          </button>
        ))}
      </div>
      {(creating || category) && (
        <CategoryForm
          key={category ? `${category.id}-${category.version}` : 'new'}
          category={category}
          csrf={csrf}
          onCreated={() => setCreating(false)}
        />
      )}
      <p className="cart-helper">
        Shows up to 100 categories. Category removal is intentionally unavailable while products
        reference it.
      </p>
    </section>
  );
}
function Ledger({ userId }: { userId: string }) {
  const [page, setPage] = useState(1),
    query = useAdmin(userId, `/inventory/movements?page=${page}`, movementsResponseSchema);
  return (
    <section className="admin-panel">
      <p className="eyebrow">EVERY UNIT ACCOUNTED FOR</p>
      <h2>Inventory ledger.</h2>
      <QueryState query={query} />
      {query.data && (
        <>
          <div className="admin-records">
            {query.data.data.map((m) => (
              <article key={m.id}>
                <div>
                  <strong>
                    {m.product} · {m.variant}
                  </strong>
                  <p>
                    {m.sku} · {m.reason.toLowerCase()}
                    {m.orderNumber ? ` · ${m.orderNumber}` : ''}
                  </p>
                  <p>{m.note}</p>
                  <small>
                    {date(m.createdAt)} · {m.actor ?? 'System'}
                  </small>
                </div>
                <b className={`admin-stock ${m.delta < 0 ? 'low' : ''}`}>
                  {m.delta > 0 ? '+' : ''}
                  {m.delta}
                </b>
              </article>
            ))}
          </div>
          <Pagination meta={query.data.meta} page={page} setPage={setPage} />
        </>
      )}
    </section>
  );
}
function AdminOrder({ id, userId, csrf }: { id: string; userId: string; csrf: string }) {
  const query = useAdmin(userId, `/orders/${id}`, orderResponseSchema),
    action = useAdminAction(csrf),
    [confirm, setConfirm] = useState(false),
    order = query.data?.data;
  const orderHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (order?.id) {
      orderHeading.current?.scrollIntoView({ block: 'start', behavior: 'instant' });
      orderHeading.current?.focus({ preventScroll: true });
    }
  }, [order?.id]);
  const next: Partial<Record<Order['status'], Order['status']>> = {
    CREATED: 'CONFIRMED',
    CONFIRMED: 'PROCESSING',
    PROCESSING: 'SHIPPED',
    SHIPPED: 'DELIVERED',
  };
  return (
    <section className="admin-panel">
      <QueryState query={query} />
      {order && (
        <>
          <p className="eyebrow">ORDER DETAILS · DEMO ONLY</p>
          <h2 className="admin-reference admin-workspace-heading" ref={orderHeading} tabIndex={-1}>
            {order.orderNumber}
          </h2>
          <p>
            <span className="order-status">{order.status.toLowerCase()}</span> ·{' '}
            {order.paymentStatus === 'SIMULATED_SUCCESS'
              ? 'Simulated payment succeeded'
              : 'Simulated payment failed'}{' '}
            · {date(order.createdAt)}
          </p>
          <div className="admin-order-grid">
            <div>
              <h3>Items</h3>
              {order.items.map((i) => (
                <div className="admin-order-line" key={i.variantId}>
                  <img src={i.image} alt="" width="64" height="64" />
                  <span>
                    <strong>{i.productName}</strong>
                    <small>
                      {i.variantLabel} · {i.quantity} × {formatPrice(i.unitPriceMinor)}
                    </small>
                  </span>
                  <strong>{formatPrice(i.lineTotalMinor)}</strong>
                </div>
              ))}
              <h3>Delivery snapshot</h3>
              <DeliveryDetails delivery={order.delivery} />
            </div>
            <div>
              <OrderTotals totals={order} />
            </div>
          </div>
          <ActionFeedback action={action} />
          <div className="admin-inline">
            {next[order.status] && order.paymentStatus === 'SIMULATED_SUCCESS' && (
              <button
                className="primary"
                disabled={action.busy}
                onClick={() => {
                  void action.run(`/orders/${id}/status`, 'PATCH', {
                    version: order.version,
                    status: next[order.status],
                  });
                }}
              >
                Mark {next[order.status]!.toLowerCase()}
              </button>
            )}
            {['CREATED', 'CONFIRMED', 'PROCESSING'].includes(order.status) && (
              <button
                className="secondary"
                disabled={action.busy}
                onClick={() => setConfirm(!confirm)}
              >
                Cancel order
              </button>
            )}
          </div>
          {confirm && ['CREATED', 'CONFIRMED', 'PROCESSING'].includes(order.status) && (
            <div className="admin-cancel">
              <p>Cancel this demo order and restore its stock? This order cannot be reopened.</p>
              <button
                className="primary"
                disabled={action.busy}
                onClick={() => {
                  void action
                    .run(`/orders/${id}/status`, 'PATCH', {
                      version: order.version,
                      status: 'CANCELLED',
                    })
                    .then((ok) => {
                      if (ok) setConfirm(false);
                    });
                }}
              >
                Confirm cancellation
              </button>
            </div>
          )}
          <p className="cart-helper">
            These are demo fulfillment states. No parcel or real refund is created. Shipped and
            delivered orders cannot be cancelled.
          </p>
        </>
      )}
    </section>
  );
}
function Orders({ userId, csrf }: { userId: string; csrf: string }) {
  const [params] = useSearchParams();
  const [page, setPage] = useState(1),
    [status, setStatus] = useState(() =>
      ['CREATED', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED'].includes(
        params.get('status') ?? '',
      )
        ? params.get('status')!
        : '',
    ),
    [selected, setSelected] = useState(() => params.get('order') ?? ''),
    query = useAdmin(
      userId,
      `/orders?page=${page}${status ? `&status=${status}` : ''}`,
      adminOrdersResponseSchema,
    );
  return (
    <>
      <section className="admin-panel">
        <div className="admin-section-heading">
          <div>
            <p className="eyebrow">FROM PLACED TO DELIVERED</p>
            <h2>Orders.</h2>
          </div>
          <label className="admin-period">
            Status
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All orders</option>
              {['CREATED', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED'].map(
                (s) => (
                  <option key={s} value={s}>
                    {s.toLowerCase()}
                  </option>
                ),
              )}
            </select>
          </label>
        </div>
        <QueryState query={query} />
        {query.data && (
          <>
            <div className="admin-order-list">
              {query.data.data.map((o) => (
                <button
                  key={o.id}
                  onClick={() => setSelected(o.id)}
                  className={selected === o.id ? 'selected' : ''}
                >
                  <span>
                    <strong>{o.orderNumber}</strong>
                    <small>
                      {date(o.createdAt)} · {o.itemCount} items
                    </small>
                  </span>
                  <span className="order-status">{o.status.toLowerCase()}</span>
                  <b>{formatPrice(o.totalMinor)}</b>
                  <Icon name="arrow" />
                </button>
              ))}
            </div>
            {!query.data.data.length && <p className="admin-empty">No orders match this status.</p>}
            <Pagination meta={query.data.meta} page={page} setPage={setPage} />
          </>
        )}
      </section>
      {selected && <AdminOrder key={selected} id={selected} userId={userId} csrf={csrf} />}
    </>
  );
}
function Audit({ userId }: { userId: string }) {
  const [page, setPage] = useState(1),
    query = useAdmin(userId, `/audit?page=${page}`, auditResponseSchema);
  return (
    <section className="admin-panel">
      <p className="eyebrow">CHANGE HISTORY</p>
      <h2>Audit trail.</h2>
      <p className="cart-helper">
        Actor, record and request reference for saved changes. Private delivery and password fields
        are excluded.
      </p>
      <QueryState query={query} />
      {query.data && (
        <>
          <div className="admin-records">
            {query.data.data.map((a) => (
              <article key={a.id}>
                <div>
                  <strong>{a.action.toLowerCase().replaceAll('_', ' ')}</strong>
                  <p>
                    {a.actor ?? 'System'} · {date(a.createdAt)}
                  </p>
                  <small>
                    {a.entity} {a.entityId}
                  </small>
                  <small>Request {a.requestId}</small>
                </div>
              </article>
            ))}
          </div>
          {!query.data.data.length && <p className="admin-empty">No changes recorded yet.</p>}
          <Pagination meta={query.data.meta} page={page} setPage={setPage} />
        </>
      )}
    </section>
  );
}
export default function Admin() {
  const session = useSession(),
    cache = useQueryClient(),
    [params, setParams] = useSearchParams(),
    tab = tabs.find((t) => t.toLowerCase() === params.get('tab')) ?? 'Overview';
  const user = session.data?.user,
    csrf = session.data?.csrfToken ?? '';
  const sectionHeading = useRef<HTMLHeadingElement>(null),
    previousTab = useRef(tab);
  useEffect(() => {
    if (previousTab.current !== tab) sectionHeading.current?.focus({ preventScroll: true });
    previousTab.current = tab;
  }, [tab]);
  if (session.isPending || session.isError)
    return (
      <div className="container admin-page">
        <QueryState query={session} />
      </div>
    );
  if (!user)
    return (
      <div className="container admin-page cart-empty">
        <p className="eyebrow">SHOP ADMINISTRATION</p>
        <h1>Sign in to continue.</h1>
        <p>This workspace is available to shop administrators.</p>
        <Link className="primary" to="/login?next=%2Fadmin">
          Sign in
        </Link>
      </div>
    );
  if (user.role !== 'admin')
    return (
      <div className="container admin-page cart-empty">
        <p className="eyebrow">SHOP ADMINISTRATION</p>
        <h1>Administrator access required.</h1>
        <p>Your customer account can manage shopping, addresses and orders.</p>
        <Link className="primary" to="/account">
          My account
        </Link>
      </div>
    );
  return (
    <div className="container admin-page">
      <header className="admin-heading">
        <div>
          <p className="eyebrow">COMMERCECORE / SHOP ADMINISTRATION</p>
          <h1>Behind the good finds.</h1>
          <p>A little care for every product, order and detail.</p>
        </div>
        <button
          className="secondary"
          onClick={() => {
            void cache.invalidateQueries({ queryKey: ['admin'] });
          }}
        >
          Refresh records
        </button>
      </header>
      <div className="admin-demo-note">
        <span className="admin-live-dot" />
        Demo administration <span>Demo Checkout — No Real Charge</span>
      </div>
      <nav className="admin-tabs" aria-label="Administration sections">
        {tabs.map((t) => (
          <button
            key={t}
            aria-current={t === tab ? 'page' : undefined}
            aria-controls="admin-section"
            onClick={() => setParams({ tab: t.toLowerCase() })}
          >
            {t}
          </button>
        ))}
      </nav>
      <div
        key={tab}
        className="admin-content"
        id="admin-section"
        role="region"
        aria-labelledby="admin-section-title"
      >
        <h2 className="sr-only" id="admin-section-title" ref={sectionHeading} tabIndex={-1}>
          {tab}
        </h2>
        {tab === 'Overview' ? (
          <Overview userId={user.id} />
        ) : tab === 'Catalog' ? (
          <Catalog userId={user.id} csrf={csrf} />
        ) : tab === 'Categories' ? (
          <Categories userId={user.id} csrf={csrf} />
        ) : tab === 'Inventory' ? (
          <Catalog userId={user.id} csrf={csrf} inventory />
        ) : tab === 'Orders' ? (
          <Orders userId={user.id} csrf={csrf} />
        ) : (
          <Audit userId={user.id} />
        )}
      </div>
    </div>
  );
}
