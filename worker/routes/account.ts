import { mutationLimit } from '../middleware/rate-limit.ts';
import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../types.ts';
import {
  registerSchema,
  loginSchema,
  profileInputSchema,
  addressInputSchema,
  addressUpdateSchema,
  versionSchema,
  emailSchema,
  passwordSchema,
} from '../../shared/account.ts';
import { readJSON } from '../validators/json.ts';
import {
  sessionView,
  getSession,
  checkPreauthCSRF,
  checkSessionCSRF,
  register,
  login,
  endSession,
  authEnvironment,
  authLimit,
} from '../services/auth.ts';
import { requireAuth, protectMutation } from '../middleware/auth.ts';
import * as account from '../repositories/account.ts';
import { ServiceError } from '../services/errors.ts';
import { supabaseRecover, supabaseReset } from '../services/supabase.ts';
import { sha256 } from '../services/crypto.ts';

export const accountRoutes = new Hono<AppEnv>();
accountRoutes.get('/auth/session', async (c) =>
  c.json({ data: await sessionView(c), requestId: c.get('requestId') }),
);
async function protectForm(c: Parameters<typeof sessionView>[0]) {
  authEnvironment(c);
  const session = await getSession(c);
  if (session) await checkSessionCSRF(c, session);
  else await checkPreauthCSRF(c);
}
accountRoutes.post('/auth/register', async (c) => {
  await protectForm(c);
  const data = await register(c, await readJSON(c, registerSchema));
  return c.json({ data, requestId: c.get('requestId') }, 201);
});
accountRoutes.post('/auth/login', async (c) => {
  await protectForm(c);
  const data = await login(c, await readJSON(c, loginSchema));
  return c.json({ data, requestId: c.get('requestId') });
});
accountRoutes.post('/auth/logout', requireAuth, protectMutation, async (c) => {
  await endSession(c, c.get('auth'));
  return c.body(null, 204);
});
accountRoutes.post('/auth/recover', async (c) => {
  await protectForm(c);
  if (c.env.AUTH_PROVIDER !== 'supabase')
    throw new ServiceError(503, 'AUTH_UNAVAILABLE', 'Recovery is unavailable on the local demo.');
  const input = await readJSON(c, z.object({ email: emailSchema }).strict());
  await authLimit(c, input.email, 'register');
  await supabaseRecover(c.env, input.email);
  return c.json({
    data: { message: 'If an account exists, check your email for a recovery link.' },
    requestId: c.get('requestId'),
  });
});
accountRoutes.post('/auth/reset-password', async (c) => {
  await protectForm(c);
  if (c.env.AUTH_PROVIDER !== 'supabase')
    throw new ServiceError(503, 'AUTH_UNAVAILABLE', 'Recovery is unavailable on the local demo.');
  const input = await readJSON(
    c,
    z
      .object({
        accessToken: z.string().min(20).max(6000),
        password: passwordSchema,
      })
      .strict(),
  );
  await authLimit(c, await sha256(input.accessToken), 'register');
  await supabaseReset(c.env, input.accessToken, input.password);
  return c.json({
    data: { message: 'Password updated. Sign in with your new password.' },
    requestId: c.get('requestId'),
  });
});
accountRoutes.use('/me', requireAuth, protectMutation, mutationLimit('account'));
accountRoutes.use('/me/*', requireAuth, protectMutation, mutationLimit('account'));
accountRoutes.get('/me', (c) =>
  c.json({ data: c.get('auth').user, requestId: c.get('requestId') }),
);
accountRoutes.patch('/me', async (c) => {
  const input = await readJSON(c, profileInputSchema);
  const user = await account.updateProfile(
    c.env.DB,
    c.get('auth').user.id,
    input.name,
    input.version,
  );
  if (!user)
    throw new ServiceError(409, 'STALE_PROFILE', 'Your profile changed. Reload before saving.');
  return c.json({ data: user, requestId: c.get('requestId') });
});
accountRoutes.get('/me/addresses', async (c) =>
  c.json({
    data: await account.addresses(c.env.DB, c.get('auth').user.id),
    requestId: c.get('requestId'),
  }),
);
accountRoutes.post('/me/addresses', async (c) => {
  const input = await readJSON(c, addressInputSchema),
    id = crypto.randomUUID(),
    userId = c.get('auth').user.id;
  if (!(await account.insertAddress(c.env.DB, userId, id, input)))
    throw new ServiceError(409, 'ADDRESS_LIMIT', 'You can save up to 10 addresses.');
  return c.json(
    { data: await account.address(c.env.DB, userId, id), requestId: c.get('requestId') },
    201,
  );
});
accountRoutes.patch('/me/addresses/:id', async (c) => {
  const input = await readJSON(c, addressUpdateSchema),
    id = c.req.param('id'),
    userId = c.get('auth').user.id;
  if (!(await account.address(c.env.DB, userId, id)))
    throw new ServiceError(404, 'ADDRESS_NOT_FOUND', 'Address not found.');
  if (!(await account.changeAddress(c.env.DB, userId, id, input)))
    throw new ServiceError(409, 'STALE_ADDRESS', 'This address changed. Reload before saving.');
  return c.json({
    data: await account.address(c.env.DB, userId, id),
    requestId: c.get('requestId'),
  });
});
accountRoutes.delete('/me/addresses/:id', async (c) => {
  const input = await readJSON(c, z.object({ version: versionSchema }).strict()),
    id = c.req.param('id'),
    userId = c.get('auth').user.id;
  if (!(await account.address(c.env.DB, userId, id)))
    throw new ServiceError(404, 'ADDRESS_NOT_FOUND', 'Address not found.');
  if (!(await account.removeAddress(c.env.DB, userId, id, input.version)))
    throw new ServiceError(409, 'STALE_ADDRESS', 'This address changed. Reload before removing.');
  return c.body(null, 204);
});
