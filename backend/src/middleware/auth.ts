import type { MiddlewareHandler } from 'hono';
import type { AppEnv } from '../types.ts';
import { getSession, checkSessionCSRF } from '../services/auth.ts';
import { ServiceError } from '../services/errors.ts';

export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (c.get('auth')) return next();
  const session = await getSession(c);
  if (!session) throw new ServiceError(401, 'AUTH_REQUIRED', 'Sign in to continue.');
  c.set('auth', session);
  await next();
};
export const requireAdmin: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (c.get('auth').user.role !== 'admin')
    throw new ServiceError(403, 'ADMIN_REQUIRED', 'Administrator access is required.');
  await next();
};
export const protectMutation: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(c.req.method)) await checkSessionCSRF(c, c.get('auth'));
  await next();
};
