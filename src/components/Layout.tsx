import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { Icon } from './Icon';
import { useCategories } from '../features/catalog/query';
import { useSession } from '../features/account/query';
import { useCart } from '../features/cart/query';
import { useWishlist } from '../features/wishlist/query';
import { CartDrawer } from './CartDrawer';

export function Layout() {
  const categoryQuery = useCategories();
  const categories = categoryQuery.data ?? [];
  const session = useSession();
  const cart = useCart(session.data?.user?.id);
  const wishlist = useWishlist(session.data?.user?.id);
  const location = useLocation();
  const navigate = useNavigate();
  const [menu, setMenu] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const searchButton = useRef<HTMLButtonElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!searchOpen) return;
    searchInput.current?.focus({ preventScroll: true });
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSearchOpen(false);
        searchButton.current?.focus({ preventScroll: true });
      }
    };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [searchOpen]);
  useEffect(() => {
    if (!menu) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenu(false);
        menuButton.current?.focus();
      }
    };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [menu]);
  const [theme, setTheme] = useState(() => {
    try {
      const saved = localStorage.getItem('commercecore-theme');
      return saved === 'dark' || saved === 'light' ? saved : 'light';
    } catch {
      return 'light';
    }
  });
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem('commercecore-theme', theme);
    } catch {
      /* Theme still works when storage is disabled. */
    }
  }, [theme]);
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
    document.getElementById('main-content')?.focus({ preventScroll: true });
  }, [location.pathname]);
  const search = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const q = String(new FormData(event.currentTarget).get('q') ?? '').trim();
    navigate(`/shop${q ? `?${new URLSearchParams({ q })}` : ''}`);
    setMenu(false);
    setSearchOpen(false);
  };
  const closeMenu = () => {
    setMenu(false);
    setSearchOpen(false);
  };
  return (
    <>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <div className="preview-bar">
        <span>Good finds for a better everyday.</span>
        <span className="demo-header-label">Demo store · No real payments</span>
        <Link to="/about">
          About this demo <span aria-hidden="true">↗</span>
        </Link>
      </div>
      <header className="store-header">
        <div className="container header-inner">
          <Link className="brand" to="/" onClick={closeMenu} aria-label="CommerceCore home">
            CommerceCore
          </Link>
          <nav className="editorial-header-nav" aria-label="Main navigation">
            <NavLink to="/shop">Shop</NavLink>
            {['clothing', 'electronics', 'jewellery', 'home'].map((slug) => (
              <NavLink key={slug} to={'/categories/' + slug}>
                {slug.charAt(0).toUpperCase() + slug.slice(1)}
              </NavLink>
            ))}
          </nav>
          <div className="header-tools">
            <Link className="icon-button header-wishlist" to="/wishlist" aria-label="Wishlist">
              <Icon name="heart" />
            </Link>
            <button
              className="icon-button"
              aria-label="Search products"
              aria-expanded={searchOpen}
              aria-controls="header-search-panel"
              ref={searchButton}
              onClick={() => setSearchOpen(!searchOpen)}
            >
              <Icon name={searchOpen ? 'close' : 'search'} />
            </button>
            <Link
              className="icon-button header-profile"
              to={session.data?.user ? '/account' : '/login'}
              aria-label={session.data?.user ? 'My account' : 'Sign in'}
            >
              <Icon name="account" />
            </Link>
            <button
              className="icon-button header-cart"
              onClick={() => {
                closeMenu();
                window.dispatchEvent(new Event('commercecore:open-bag'));
              }}
              aria-label={'Shopping bag' + (cart.data ? ', ' + cart.data.itemCount + ' items' : '')}
            >
              <Icon name="cart" />
              {Boolean(cart.data?.itemCount) && (
                <span className="cart-count" aria-hidden="true">
                  {cart.data!.itemCount > 99 ? '99+' : cart.data!.itemCount}
                </span>
              )}
            </button>
            <button
              className="icon-button theme-toggle"
              title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              aria-label={'Switch to ' + (theme === 'dark' ? 'light' : 'dark') + ' theme'}
            >
              <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
            </button>
            <button
              className="icon-button menu-toggle"
              onClick={() => setMenu(!menu)}
              aria-expanded={menu}
              aria-controls="mobile-menu"
              ref={menuButton}
              aria-label={menu ? 'Close menu' : 'Open menu'}
            >
              <Icon name={menu ? 'close' : 'menu'} />
            </button>
          </div>
        </div>
        {searchOpen && (
          <div className="container editorial-search" id="header-search-panel">
            <form className="search-form header-search" onSubmit={search} role="search">
              <label className="sr-only" htmlFor="site-search">
                Search products
              </label>
              <input
                key={new URLSearchParams(location.search).get('q') ?? ''}
                id="site-search"
                ref={searchInput}
                name="q"
                defaultValue={new URLSearchParams(location.search).get('q') ?? ''}
                maxLength={100}
                placeholder="Search the collection…"
                type="search"
              />
              <button className="icon-button" aria-label="Search">
                <Icon name="search" />
              </button>
            </form>
          </div>
        )}
        {menu && (
          <nav className="mobile-nav container" id="mobile-menu" aria-label="Mobile navigation">
            <Link to="/orders" onClick={closeMenu}>
              My orders
            </Link>
            <Link to="/wishlist" onClick={closeMenu}>
              Wishlist{wishlist.data ? ` (${wishlist.data.length})` : ''}
            </Link>
            <Link to="/cart" onClick={closeMenu}>
              Shopping bag
            </Link>
            <Link to={session.data?.user ? '/account' : '/login'} onClick={closeMenu}>
              {session.data?.user ? 'My account' : 'Sign in / create account'}
            </Link>
            <NavLink to="/shop" onClick={closeMenu}>
              Shop all
            </NavLink>
            {categories.map((category) => (
              <NavLink key={category.slug} to={`/categories/${category.slug}`} onClick={closeMenu}>
                {category.name}
              </NavLink>
            ))}
            <Link to="/about" onClick={closeMenu}>
              About the demo
            </Link>
          </nav>
        )}
      </header>
      <main id="main-content" tabIndex={-1}>
        <Outlet />
      </main>
      <footer className="store-footer">
        <div className="container footer-top">
          <div>
            <Link className="brand" to="/">
              CommerceCore<span className="brand-dot">.</span>
            </Link>
            <p>
              Good finds. Better everyday.
              <br />
              Thoughtful essentials for home, work and life.
            </p>
          </div>
          <div>
            <h2>Explore</h2>
            <Link to="/orders">My demo orders</Link>
            <Link to="/shop">The collection</Link>
            {categories.map((category) => (
              <Link key={category.slug} to={`/categories/${category.slug}`}>
                {category.name}
              </Link>
            ))}
          </div>
          <div>
            <h2>Behind the project</h2>
            <Link to="/about">About this demo</Link>
            <Link to="/engineering">Engineering foundation</Link>
            <p>
              AI-generated product photography.
              <br />
              Sample products. No real charges.
            </p>
          </div>
        </div>
        <div className="container footer-bottom">
          <span>© {new Date().getFullYear()} CommerceCore · Portfolio demonstration</span>
          <span>React · TypeScript · Cloudflare</span>
        </div>
      </footer>
      <CartDrawer />
    </>
  );
}
