import { useEffect, useRef } from 'react';
import { Link } from 'react-router';
import { useSession } from '../features/account/query';
import { useCart, useCartMutation } from '../features/cart/query';
import { formatPrice } from '../features/catalog/model';
import { Icon } from './Icon';

export function CartDrawer() {
  const dialog = useRef<HTMLDialogElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const session = useSession();
  const cart = useCart(session.data?.user?.id);
  const mutation = useCartMutation();
  const close = () => dialog.current?.close();
  useEffect(() => {
    let previousFocus: HTMLElement | null = null;
    const element = dialog.current;
    if (!element) return;
    const open = () => {
      if (element.open) return;
      previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      element.showModal();
      document.body.classList.add('bag-open');
      closeButton.current?.focus();
    };
    const restore = () => {
      document.body.classList.remove('bag-open');
      previousFocus?.focus({ preventScroll: true });
    };
    window.addEventListener('commercecore:open-bag', open);
    element.addEventListener('close', restore);
    return () => {
      window.removeEventListener('commercecore:open-bag', open);
      element.removeEventListener('close', restore);
      element.close();
      document.body.classList.remove('bag-open');
    };
  }, []);
  return (
    <dialog
      className="bag-drawer"
      ref={dialog}
      aria-labelledby="bag-title"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          const bounds = event.currentTarget.getBoundingClientRect();
          if (
            event.clientX < bounds.left ||
            event.clientX > bounds.right ||
            event.clientY < bounds.top ||
            event.clientY > bounds.bottom
          )
            close();
        }
      }}
    >
      <div className="bag-panel">
        <header className="bag-heading">
          <div>
            <p className="eyebrow">A FEW GOOD FINDS</p>
            <h2 id="bag-title">
              Your shopping bag<span> ({cart.data?.itemCount ?? 0})</span>
            </h2>
          </div>
          <button
            ref={closeButton}
            className="icon-button"
            aria-label="Close shopping bag"
            onClick={close}
          >
            <Icon name="close" />
          </button>
        </header>
        <div className="bag-content">
          {session.isPending && <p role="status">Opening your bag…</p>}
          {session.isError && (
            <p role="alert">
              Account connection unavailable.{' '}
              <Link onClick={close} to="/cart">
                Open your cart to retry.
              </Link>
            </p>
          )}
          {session.data && !session.data.user && (
            <div className="bag-empty">
              <Icon name="cart" />
              <h3>A home for your good finds.</h3>
              <p>Sign in to save your bag across visits.</p>
              <Link className="primary" onClick={close} to="/login?next=%2Fcart">
                Sign in to your bag <Icon name="arrow" />
              </Link>
            </div>
          )}
          {session.data?.user && cart.isPending && <p role="status">Loading your saved finds…</p>}
          {cart.isError && (
            <p role="alert">
              Your bag could not be loaded.{' '}
              <button
                className="text-button"
                onClick={() => {
                  void cart.refetch();
                }}
              >
                Try again
              </button>
            </p>
          )}
          {mutation.isError && (
            <p role="alert" className="cart-error">
              {mutation.error.message}
            </p>
          )}
          {session.data?.user && cart.data?.items.length === 0 && (
            <div className="bag-empty">
              <Icon name="cart" />
              <h3>A little room for inspiration.</h3>
              <p>Your bag is empty. Find something for your everyday.</p>
              <Link className="primary" onClick={close} to="/shop">
                Explore the collection <Icon name="arrow" />
              </Link>
            </div>
          )}
          {session.data?.user &&
            cart.data?.items.map((line) => (
              <article className="bag-line" key={line.variantId}>
                <Link
                  onClick={close}
                  to={'/products/' + line.slug + '?variant=' + encodeURIComponent(line.variantId)}
                >
                  <img src={line.image} alt={line.name} width="100" height="120" />
                </Link>
                <div>
                  <p className="eyebrow">{line.label}</p>
                  <h3>
                    <Link onClick={close} to={'/products/' + line.slug}>
                      {line.name}
                    </Link>
                  </h3>
                  <p>{formatPrice(line.unitPriceMinor)}</p>
                  {line.issue && (
                    <p className="cart-error">
                      {line.issue === 'UNAVAILABLE'
                        ? 'Unavailable. Please remove this item.'
                        : 'Stock changed. Please adjust your bag.'}
                    </p>
                  )}
                  <div className="bag-line-controls">
                    <label>
                      Qty{' '}
                      <select
                        aria-label={'Bag quantity for ' + line.name + ', ' + line.label}
                        value={line.quantity}
                        disabled={
                          mutation.isPending ||
                          cart.isFetching ||
                          line.stock === 0 ||
                          line.issue === 'UNAVAILABLE'
                        }
                        onChange={(event) =>
                          mutation.mutate({
                            method: 'PUT',
                            variantId: line.variantId,
                            quantity: Number(event.target.value),
                            version: cart.data!.version,
                          })
                        }
                      >
                        {Array.from(
                          { length: Math.max(line.quantity, Math.min(20, line.stock)) },
                          (_, index) => (
                            <option key={index + 1} disabled={index + 1 > line.stock}>
                              {index + 1}
                            </option>
                          ),
                        )}
                      </select>
                    </label>
                    <button
                      className="text-button"
                      disabled={mutation.isPending || cart.isFetching}
                      aria-label={'Remove ' + line.name + ', ' + line.label + ' from bag'}
                      onClick={() =>
                        mutation.mutate({
                          method: 'DELETE',
                          variantId: line.variantId,
                          version: cart.data!.version,
                        })
                      }
                    >
                      Remove
                    </button>
                  </div>
                </div>
                <strong>{formatPrice(line.lineTotalMinor)}</strong>
              </article>
            ))}
        </div>
        {session.data?.user && cart.data && cart.data.items.length > 0 && (
          <footer className="bag-total">
            <div>
              <span>Subtotal</span>
              <strong>{formatPrice(cart.data.subtotalMinor)}</strong>
            </div>
            <p>Shipping and illustrative tax calculated at checkout.</p>
            {cart.data.hasIssues && <p role="status">Resolve unavailable items before checkout.</p>}
            <Link className="primary" onClick={close} to="/cart">
              View bag & checkout <Icon name="arrow" />
            </Link>
            <button className="text-button" onClick={close}>
              Continue exploring
            </button>
            <small>Demo checkout · No real charge</small>
          </footer>
        )}
      </div>
    </dialog>
  );
}
