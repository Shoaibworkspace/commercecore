import { Hono } from 'hono';
import type { AppEnv } from '../types.ts';
import { databaseReady } from '../repositories/health.ts';

export const healthRoutes = new Hono<AppEnv>();

healthRoutes.get('/health', (c) =>
  c.json({
    data: { service: 'CommerceCore', status: 'ok', phase: 8, paymentMode: 'demo' },
    requestId: c.get('requestId'),
  }),
);

healthRoutes.get('/ready', async (c) => {
  try {
    if (await databaseReady(c.env.DB, c.env.AUTH_PROVIDER === 'supabase')) {
      return c.json({
        data: { status: 'ready', database: 'connected' },
        requestId: c.get('requestId'),
      });
    }
  } catch {
    /* Report readiness failure without exposing SQL or provider errors. */
  }
  return c.json(
    {
      error: {
        code: 'NOT_READY',
        message: 'Database is unavailable or migrations have not been applied.',
      },
      requestId: c.get('requestId'),
    },
    503,
  );
});
