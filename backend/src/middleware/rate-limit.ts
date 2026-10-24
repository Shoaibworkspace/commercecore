import type { Context, MiddlewareHandler } from 'hono';
import type { AppEnv } from '../types.ts';
import { authSecret } from '../services/auth.ts';
import { hmac } from '../services/crypto.ts';
import { ServiceError } from '../services/errors.ts';

// Fixed, account-scoped buckets cannot be multiplied with arbitrary paths or keys.
export const mutationPolicies = {
  account: { limit: 60, seconds: 60 },
  shopping: { limit: 120, seconds: 60 },
  quote: { limit: 20, seconds: 60 },
  checkout: { limit: 20, seconds: 60 },
  cancellation: { limit: 12, seconds: 60 },
  administration: { limit: 60, seconds: 60 },
} as const;
export type MutationScope = keyof typeof mutationPolicies;
export async function consumeMutationBudget(c: Context<AppEnv>, scope: MutationScope) {
  const { limit, seconds } = mutationPolicies[scope];
  const time = Math.floor(Date.now() / 1000);
  const key = await hmac(authSecret(c.env), `mutation:v1:${scope}:${c.get('auth').user.id}`);
  let row: { attempts: number; expires_at: number } | undefined;
  try {
    const db = c.env.DB.withSession('first-primary');
    const results = await db.batch<{ attempts: number; expires_at: number }>([
      db
        .prepare(
          `INSERT INTO auth_rate_limits(key,window_start,attempts,expires_at) VALUES(?,?,1,?)
        ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN expires_at<=? THEN 1 ELSE min(attempts+1,?) END,
        window_start=CASE WHEN expires_at<=? THEN ? ELSE window_start END,
        expires_at=CASE WHEN expires_at<=? THEN ? ELSE expires_at END RETURNING attempts,expires_at`,
        )
        .bind(key, time, time + seconds, time, limit + 1, time, time, time, time + seconds),
      db
        .prepare(
          `DELETE FROM auth_rate_limits WHERE key IN
        (SELECT key FROM auth_rate_limits WHERE expires_at<=? ORDER BY expires_at LIMIT 20)`,
        )
        .bind(time),
    ]);
    row = results[0]?.results[0];
  } catch {
    throw new ServiceError(
      503,
      'RATE_LIMIT_UNAVAILABLE',
      'Changes are temporarily unavailable. Please try again.',
    );
  }
  if (!row)
    throw new ServiceError(
      503,
      'RATE_LIMIT_UNAVAILABLE',
      'Changes are temporarily unavailable. Please try again.',
    );
  if (row.attempts > limit) {
    c.header('Retry-After', String(Math.max(1, row.expires_at - time)));
    throw new ServiceError(
      429,
      'MUTATION_RATE_LIMIT',
      'Too many changes. Please wait a minute before trying again.',
    );
  }
}
// Mount only after authentication, role checks and CSRF; cross-site requests
// cannot consume another customer's allowance. GET/HEAD never consume writes.
export function mutationLimit(scope: MutationScope): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(c.req.method)) await consumeMutationBudget(c, scope);
    await next();
  };
}
