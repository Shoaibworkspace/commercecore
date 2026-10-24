import React, { lazy, Suspense } from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Route, Routes } from 'react-router';
import { Foundation } from './pages/Foundation';
import { Layout } from './components/Layout';
import { AppErrorBoundary } from './components/AppErrorBoundary';
import { StartupIntro } from './components/StartupIntro';
import './styles/store.css';
import './styles/commerce.css';
import './styles/account.css';
import './styles/cart.css';
import './styles/wishlist.css';
import './styles/checkout.css';
import './styles/admin.css';
import './styles/editorial.css';

const Home = lazy(() => import('./pages/Home'));
const Shop = lazy(() => import('./pages/Shop'));
const Product = lazy(() => import('./pages/Product'));
const About = lazy(() => import('./pages/About'));
const NotFound = lazy(() => import('./pages/NotFound'));
const Auth = lazy(() => import('./pages/Auth'));
const Recovery = lazy(() => import('./pages/Recovery'));
const Account = lazy(() => import('./pages/Account'));
const Cart = lazy(() => import('./pages/Cart'));
const Wishlist = lazy(() => import('./pages/Wishlist'));
const Checkout = lazy(() => import('./pages/Checkout'));
const Orders = lazy(() => import('./pages/Orders'));
const Admin = lazy(() => import('./pages/Admin'));
const Order = lazy(() => import('./pages/Order'));

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false } },
});
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <StartupIntro>
      <AppErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <BrowserRouter>
            <Suspense
              fallback={
                <div className="route-loading" role="status">
                  Preparing the collection…
                </div>
              }
            >
              <Routes>
                <Route element={<Layout />}>
                  <Route index element={<Home />} />
                  <Route path="shop" element={<Shop />} />
                  <Route path="categories/:category" element={<Shop />} />
                  <Route path="products/:slug" element={<Product />} />
                  <Route path="about" element={<About />} />
                  <Route path="login" element={<Auth mode="login" />} />
                  <Route path="register" element={<Auth mode="register" />} />
                  <Route path="forgot-password" element={<Recovery />} />
                  <Route path="reset-password" element={<Recovery reset />} />
                  <Route path="account" element={<Account />} />
                  <Route path="cart" element={<Cart />} />
                  <Route path="wishlist" element={<Wishlist />} />
                  <Route path="checkout" element={<Checkout />} />
                  <Route path="orders" element={<Orders />} />
                  <Route path="orders/:id" element={<Order />} />
                  <Route path="admin" element={<Admin />} />
                  <Route path="*" element={<NotFound />} />
                </Route>
                <Route path="engineering" element={<Foundation />} />
              </Routes>
            </Suspense>
          </BrowserRouter>
        </QueryClientProvider>
      </AppErrorBoundary>
    </StartupIntro>
  </React.StrictMode>,
);
