import type { Context } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import type { AppEnv, AuthSession, Bindings } from '../types.ts';
import { ServiceError } from './errors.ts';
import { equal, hmac, randomToken, sha256, hashPassword, verifyPassword } from './crypto.ts';
import type { User } from '../../../shared/account.ts';
import { supabaseConfig, supabaseLogin, supabaseRegister } from './supabase.ts';

export const now = () => Math.floor(Date.now() / 1000);
const SESSION_SECONDS = 86400,
  IDLE_SECONDS = 7200;
const sessionName = (env: Bindings) =>
  env.APP_ENV === 'production' ? '__Host-cc_session' : 'cc_session';
const preauthName = (env: Bindings) =>
  env.APP_ENV === 'production' ? '__Host-cc_preauth' : 'cc_preauth';
export function authSecret(env: Bindings) {
  if (env.AUTH_PROVIDER === 'supabase') supabaseConfig(env);
  if (!env.AUTH_SECRET || !/^[0-9a-f]{64}$/i.test(env.AUTH_SECRET))
    throw new ServiceError(503, 'AUTH_UNAVAILABLE', 'Account access is temporarily unavailable.');
  let publicOriginValid = false;
  try {
    const origin = new URL(env.APP_ORIGIN ?? '');
    publicOriginValid = origin.protocol === 'https:' && origin.origin === env.APP_ORIGIN;
  } catch {
    /* Missing/invalid origin fails closed. */
  }
  if (
    !['development', 'production'].includes(env.APP_ENV) ||
    (env.APP_ENV === 'production' &&
      (env.AUTH_PUBLIC_ENABLED !== 'verified' ||
        !publicOriginValid ||
        env.AUTH_PROVIDER !== 'supabase'))
  )
    throw new ServiceError(
      503,
      'AUTH_UNAVAILABLE',
      'Account access is not enabled on this deployment.',
    );
  return env.AUTH_SECRET;
}
export function authEnvironment(c: Context<AppEnv>) {
  authSecret(c.env);
  const url = new URL(c.req.url);
  if (
    (c.env.APP_ENV === 'development' &&
      !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) ||
    (c.env.APP_ENV === 'production' && url.origin !== c.env.APP_ORIGIN)
  )
    throw new ServiceError(
      503,
      'AUTH_UNAVAILABLE',
      'Account access is not enabled on this deployment.',
    );
}
export function checkOrigin(c: Context<AppEnv>) {
  const expected =
    c.env.APP_ORIGIN ?? (c.env.APP_ENV === 'production' ? undefined : new URL(c.req.url).origin);
  const origin = c.req.header('origin');
  if (!origin || origin !== expected || c.req.header('sec-fetch-site') === 'cross-site')
    throw new ServiceError(
      403,
      'ORIGIN_REJECTED',
      'Open this form from the CommerceCore site and try again.',
    );
}
const csrfFor = (env: Bindings, hash: string) => hmac(authSecret(env), `session-csrf:v1:${hash}`);
const cookieOptions = (env: Bindings, maxAge: number) => ({
  httpOnly: true,
  secure: env.APP_ENV === 'production',
  sameSite: 'Lax' as const,
  path: '/',
  maxAge,
});
export async function getSession(c: Context<AppEnv>): Promise<AuthSession | null> {
  const token = getCookie(c, sessionName(c.env));
  if (!token || !/^[0-9a-f]{64}$/.test(token)) return null;
  authEnvironment(c);
  const hash = await sha256(token),
    time = now();
  const row = await c.env.DB.prepare(
    `SELECT u.id,u.email,u.name,u.role,u.version,
    s.token_hash AS tokenHash,s.csrf_token_hash AS csrfHash,s.expires_at AS expiresAt,s.last_seen_at AS lastSeen
    FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AND s.last_seen_at>?`,
  )
    .bind(hash, time, time - IDLE_SECONDS)
    .first<User & { tokenHash: string; csrfHash: string; expiresAt: number; lastSeen: number }>();
  if (!row || !equal(row.csrfHash, await sha256(await csrfFor(c.env, hash)))) {
    deleteCookie(c, sessionName(c.env), cookieOptions(c.env, 0));
    return null;
  }
  if (row.lastSeen < time - 300)
    await c.env.DB.prepare('UPDATE sessions SET last_seen_at=? WHERE token_hash=? AND expires_at>?')
      .bind(time, hash, time)
      .run();
  return {
    user: { id: row.id, email: row.email, name: row.name, role: row.role, version: row.version },
    tokenHash: hash,
    csrfHash: row.csrfHash,
    expiresAt: row.expiresAt,
  };
}
export async function sessionView(c: Context<AppEnv>) {
  authEnvironment(c);
  const session = await getSession(c);
  const authProvider = c.env.AUTH_PROVIDER ?? 'local';
  if (session)
    return { user: session.user, csrfToken: await csrfFor(c.env, session.tokenHash), authProvider };
  // Signed pre-login token prevents login/registration CSRF; not an authenticated session.
  const existing = getCookie(c, preauthName(c.env));
  const parts = existing?.match(/^([0-9a-f]{64})\.(\d{10})\.([0-9a-f]{64})$/);
  if (
    parts &&
    Number(parts[2]) > now() &&
    equal(parts[3]!, await hmac(authSecret(c.env), `preauth:v1:${parts[1]}.${parts[2]}`))
  )
    return { user: null, csrfToken: existing!, authProvider };
  const payload = `${randomToken()}.${now() + 1800}`;
  const token = `${payload}.${await hmac(authSecret(c.env), `preauth:v1:${payload}`)}`;
  setCookie(c, preauthName(c.env), token, cookieOptions(c.env, 1800));
  return { user: null, csrfToken: token, authProvider };
}
export async function checkPreauthCSRF(c: Context<AppEnv>) {
  checkOrigin(c);
  const cookie = getCookie(c, preauthName(c.env)),
    header = c.req.header('x-csrf-token');
  const parts = cookie?.match(/^([0-9a-f]{64})\.(\d{10})\.([0-9a-f]{64})$/);
  if (
    !parts ||
    !header ||
    !equal(cookie!, header) ||
    Number(parts[2]) <= now() ||
    !equal(parts[3]!, await hmac(authSecret(c.env), `preauth:v1:${parts[1]}.${parts[2]}`))
  )
    throw new ServiceError(403, 'CSRF_REJECTED', 'Reload the form and try again.');
}
export async function checkSessionCSRF(c: Context<AppEnv>, session: AuthSession) {
  checkOrigin(c);
  const supplied = c.req.header('x-csrf-token');
  if (
    !supplied ||
    !/^[0-9a-f]{64}$/.test(supplied) ||
    !equal(await sha256(supplied), session.csrfHash)
  )
    throw new ServiceError(403, 'CSRF_REJECTED', 'Reload your account and try again.');
}
export async function startSession(
  c: Context<AppEnv>,
  user: User,
  createUser?: D1PreparedStatement,
  lifetime = SESSION_SECONDS,
) {
  const token = randomToken(),
    tokenHash = await sha256(token),
    csrfToken = await csrfFor(c.env, tokenHash),
    time = now();
  const previous = getCookie(c, sessionName(c.env));
  const statements = [
    c.env.DB.prepare(
      'DELETE FROM sessions WHERE token_hash IN (SELECT token_hash FROM sessions WHERE expires_at<=? OR last_seen_at<=? LIMIT 100)',
    ).bind(time, time - IDLE_SECONDS),
    c.env.DB.prepare(
      `INSERT INTO sessions (token_hash,user_id,csrf_token_hash,expires_at,created_at,last_seen_at) VALUES (?,?,?,?,?,?)`,
    ).bind(tokenHash, user.id, await sha256(csrfToken), time + lifetime, time, time),
  ];
  if (createUser) statements.unshift(createUser);
  if (previous && /^[0-9a-f]{64}$/.test(previous))
    statements.push(
      c.env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await sha256(previous)),
    );
  // Keep at most five active devices; the newly created token wins equal-timestamp ties.
  statements.push(
    c.env.DB.prepare(
      `DELETE FROM sessions WHERE user_id=? AND token_hash NOT IN
    (SELECT token_hash FROM sessions WHERE user_id=? ORDER BY (token_hash=?) DESC,created_at DESC,token_hash LIMIT 5)`,
    ).bind(user.id, user.id, tokenHash),
  );
  await c.env.DB.batch(statements);
  setCookie(c, sessionName(c.env), token, cookieOptions(c.env, lifetime));
  deleteCookie(c, preauthName(c.env), cookieOptions(c.env, 0));
  return { user, csrfToken, authProvider: c.env.AUTH_PROVIDER ?? 'local' };
}
export async function endSession(c: Context<AppEnv>, session: AuthSession) {
  await c.env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(session.tokenHash).run();
  deleteCookie(c, sessionName(c.env), cookieOptions(c.env, 0));
}
export async function authLimit(c: Context<AppEnv>, email: string, mode: 'login' | 'register') {
  const secret = authSecret(c.env),
    time = now(),
    seconds = mode === 'login' ? 600 : 900;
  const ip =
    c.env.APP_ENV === 'production' ? (c.req.header('cf-connecting-ip') ?? 'unknown') : 'local';
  const keys = await Promise.all([
    hmac(secret, `${mode}:ip:${ip}`),
    hmac(secret, `${mode}:account:${email}`),
  ]);
  const statements = keys.map((key) =>
    c.env.DB.prepare(
      `INSERT INTO auth_rate_limits (key,window_start,attempts,expires_at) VALUES (?,?,1,?)
    ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN expires_at<=? THEN 1 ELSE min(attempts+1,2147483647) END,
    window_start=CASE WHEN expires_at<=? THEN ? ELSE window_start END,
    expires_at=CASE WHEN expires_at<=? THEN ? ELSE expires_at END RETURNING attempts,expires_at`,
    ).bind(key, time, time + seconds, time, time, time, time, time + seconds),
  );
  const limits = mode === 'login' ? [40, 8] : [8, 3];
  // Check the shared IP bucket first: a blocked IP cannot create unbounded account keys.
  for (let index = 0; index < statements.length; index++) {
    const result = await statements[index]!.first<{ attempts: number; expires_at: number }>();
    if (!result)
      throw new ServiceError(503, 'AUTH_UNAVAILABLE', 'Account access is temporarily unavailable.');
    if (result.attempts <= limits[index]!) continue;
    c.header('Retry-After', String(Math.max(1, result.expires_at - time)));
    throw new ServiceError(
      429,
      'AUTH_RATE_LIMIT',
      'Too many attempts. Please wait before trying again.',
    );
  }
  // Bounded housekeeping; hash keys contain no raw email/IP and expire after the window.
  await c.env.DB.prepare(
    'DELETE FROM auth_rate_limits WHERE key IN (SELECT key FROM auth_rate_limits WHERE expires_at<=? LIMIT 100)',
  )
    .bind(time)
    .run();
}
export async function register(
  c: Context<AppEnv>,
  input: { name: string; email: string; password: string },
) {
  await authLimit(c, input.email, 'register');
  if (c.env.AUTH_PROVIDER === 'supabase') return supabaseRegister(c.env, input);
  const id = crypto.randomUUID(),
    passwordHash = await hashPassword(input.password);
  try {
    return await startSession(
      c,
      { id, name: input.name, email: input.email, role: 'customer', version: 0 },
      c.env.DB.prepare('INSERT INTO users (id,name,email,password_hash) VALUES (?,?,?,?)').bind(
        id,
        input.name,
        input.email,
        passwordHash,
      ),
    );
  } catch (error) {
    if (error instanceof Error && /UNIQUE constraint failed/.test(error.message))
      throw new ServiceError(
        409,
        'ACCOUNT_NOT_CREATED',
        'Unable to create this account. Try signing in or use another email.',
      );
    throw error;
  }
}
export async function login(c: Context<AppEnv>, input: { email: string; password: string }) {
  await authLimit(c, input.email, 'login');
  if (c.env.AUTH_PROVIDER === 'supabase') {
    const { user, lifetime } = await supabaseLogin(c.env, input);
    return startSession(c, user, undefined, lifetime);
  }
  const row = await c.env.DB.prepare(
    'SELECT id,email,name,role,version,password_hash FROM users WHERE email=?',
  )
    .bind(input.email)
    .first<User & { password_hash: string }>();
  if (!(await verifyPassword(input.password, row?.password_hash)) || !row)
    throw new ServiceError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
  return startSession(c, {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    version: row.version,
  });
}
