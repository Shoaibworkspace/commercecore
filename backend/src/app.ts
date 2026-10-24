import { Hono } from 'hono';
import type { AppEnv } from './types.ts';
import { security } from './middleware/security.ts';
import { healthRoutes } from './routes/health.ts';
import { catalogRoutes } from './routes/catalog.ts';
import { ServiceError } from './services/errors.ts';
import { accountRoutes } from './routes/account.ts';
import { cartRoutes } from './routes/cart.ts';
import { wishlistRoutes } from './routes/wishlist.ts';
import { adminRoutes } from './routes/admin.ts';
import { checkoutRoutes } from './routes/checkout.ts';

export const app = new Hono<AppEnv>();
app.use('/api/*', security);
app.route('/api', healthRoutes);
app.route('/api', catalogRoutes);
app.route('/api', accountRoutes);
app.route('/api', cartRoutes);
app.route('/api', wishlistRoutes);
app.route('/api', checkoutRoutes);
app.route('/api/admin', adminRoutes);
app.all('/api/admin/*', (c) =>
  c.json(
    {
      error: { code: 'NOT_FOUND', message: 'Administrator route not found.' },
      requestId: c.get('requestId'),
    },
    404,
  ),
);
app.all('/api/*', (c) =>
  c.json(
    {
      error: { code: 'NOT_FOUND', message: 'API route not found.' },
      requestId: c.get('requestId'),
    },
    404,
  ),
);
app.onError((error, c) => {
  if (error instanceof ServiceError) {
    return c.json(
      { error: { code: error.code, message: error.message }, requestId: c.get('requestId') },
      error.status,
    );
  }
  console.error(JSON.stringify({ event: 'request_failed', requestId: c.get('requestId') }));
  return c.json(
    {
      error: { code: 'INTERNAL_ERROR', message: 'The request could not be completed.' },
      requestId: c.get('requestId'),
    },
    500,
  );
});
app.all('*', (c) => c.env.ASSETS.fetch(c.req.raw));
