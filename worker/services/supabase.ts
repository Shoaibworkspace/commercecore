import { z } from 'zod';
import type { Bindings } from '../types.ts';
import { ServiceError } from './errors.ts';
import { emailSchema, nameSchema, type User } from '../../shared/account.ts';

function providerPassword(password: string) {
  if (new TextEncoder().encode(password).length > 72) {
    throw new ServiceError(
      400,
      'INVALID_PASSWORD',
      'Hosted passwords must fit within 72 UTF-8 bytes. Use a shorter unique passphrase.',
    );
  }
}

export function supabaseConfig(env: Bindings) {
  const url = env.SUPABASE_URL ?? '';
  // Pin credentials to one hosted provider; arbitrary URLs must never receive passwords.
  if (
    !/^https:\/\/[a-z0-9]{20}\.supabase\.co$/.test(url) ||
    !env.SUPABASE_PUBLISHABLE_KEY ||
    !env.SUPABASE_PUBLISHABLE_KEY.startsWith('sb_publishable_')
  ) {
    throw new ServiceError(503, 'AUTH_UNAVAILABLE', 'Account access is temporarily unavailable.');
  }
  return { url, key: env.SUPABASE_PUBLISHABLE_KEY };
}

async function providerRequest(
  env: Bindings,
  path: string,
  body: unknown,
  accessToken?: string,
  method = 'POST',
) {
  const { url, key } = supabaseConfig(env);
  let response: Response;
  try {
    response = await fetch(`${url}/auth/v1/${path}`, {
      method,
      // Workers supports manual redirects; reject 3xx below without forwarding credentials.
      redirect: 'manual',
      signal: AbortSignal.timeout(12000),
      headers: {
        apikey: key,
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (error) {
    console.warn(
      JSON.stringify({
        event: 'auth_provider_failed',
        operation: path.split('?')[0],
        kind: 'network',
        errorType: error instanceof Error ? error.name : 'UnknownError',
      }),
    );
    throw new ServiceError(503, 'AUTH_UNAVAILABLE', 'Account service is temporarily unavailable.');
  }
  if (response.status === 429) {
    throw new ServiceError(429, 'AUTH_RATE_LIMIT', 'Please wait before trying again.');
  }
  if (!response.ok) {
    console.warn(
      JSON.stringify({
        event: 'auth_provider_failed',
        operation: path.split('?')[0],
        kind: 'http',
        status: response.status,
      }),
    );
    // Never echo provider errors, emails, credentials, URLs or response tokens.
    if (
      (response.status >= 300 && response.status < 400) ||
      response.status >= 500 ||
      response.status === 401 ||
      response.status === 403
    ) {
      throw new ServiceError(
        503,
        'AUTH_UNAVAILABLE',
        'Account service is temporarily unavailable.',
      );
    }
    throw new ServiceError(
      400,
      'AUTH_NOT_COMPLETED',
      'Unable to complete this request. Check your details and email confirmation, then try again.',
    );
  }
  try {
    return (await response.json()) as unknown;
  } catch {
    console.warn(
      JSON.stringify({
        event: 'auth_provider_failed',
        operation: path.split('?')[0],
        kind: 'invalid_json',
        status: response.status,
      }),
    );
    throw new ServiceError(503, 'AUTH_UNAVAILABLE', 'Account service is temporarily unavailable.');
  }
}

const providerUser = z.object({
  id: z.uuid(),
  email: emailSchema,
  email_confirmed_at: z.iso.datetime({ offset: true }),
  user_metadata: z.object({ name: z.unknown().optional() }).optional(),
});
const providerSession = z.object({
  access_token: z.string().min(20).max(12000),
  expires_in: z.number().int().positive(),
  user: providerUser,
});
function verifiedUser(value: unknown) {
  const parsed = providerUser.safeParse(value);
  if (!parsed.success) {
    throw new ServiceError(401, 'INVALID_CREDENTIALS', 'Confirm your email before signing in.');
  }
  return parsed.data;
}

export async function supabaseRegister(
  env: Bindings,
  input: { name: string; email: string; password: string },
) {
  providerPassword(input.password);
  // Email ownership is confirmed by Supabase. Signup never grants a local session or role.
  await providerRequest(
    env,
    `signup?redirect_to=${encodeURIComponent(`${env.APP_ORIGIN}/login`)}`,
    {
      email: input.email,
      password: input.password,
      data: { name: input.name },
    },
  );
  return {
    verificationRequired: true as const,
    message:
      'Check your email to confirm your account, then sign in. If already registered, sign in.',
  };
}

export async function supabaseLogin(
  env: Bindings,
  input: { email: string; password: string },
): Promise<{ user: User; lifetime: number }> {
  providerPassword(input.password);
  const result = providerSession.safeParse(
    await providerRequest(env, 'token?grant_type=password', input),
  );
  if (!result.success) {
    throw new ServiceError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
  }
  // Ask the provider to validate the issued token. Never trust a browser-supplied identity/role.
  const identity = verifiedUser(
    await providerRequest(env, 'user', undefined, result.data.access_token, 'GET'),
  );
  if (identity.id !== result.data.user.id || identity.email !== input.email) {
    throw new ServiceError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
  }
  const provider = supabaseConfig(env).url;
  const id = `supabase:${provider.slice(8, 28)}:${identity.id}`;
  const name = nameSchema.safeParse(identity.user_metadata?.name).data ?? 'Shopper';
  try {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO users(id,email,name,password_hash) VALUES (?,?,?,'external:supabase')
       ON CONFLICT(id) DO NOTHING`,
      ).bind(id, identity.email, name),
      env.DB.prepare(
        `INSERT INTO auth_identities(provider,subject,user_id) VALUES (?,?,?)
       ON CONFLICT(provider,subject) DO NOTHING`,
      ).bind(provider, identity.id, id),
    ]);
  } catch (error) {
    if (error instanceof Error && /UNIQUE constraint failed/.test(error.message)) {
      throw new ServiceError(
        409,
        'ACCOUNT_CONFLICT',
        'Contact the store operator to resolve this account.',
      );
    }
    throw error;
  }
  const user = await env.DB.prepare(
    `SELECT u.id,u.email,u.name,u.role,u.version FROM users u
     JOIN auth_identities i ON i.user_id=u.id WHERE i.provider=? AND i.subject=?`,
  )
    .bind(provider, identity.id)
    .first<User>();
  if (!user || user.id !== id || user.email !== identity.email) {
    throw new ServiceError(
      409,
      'ACCOUNT_CONFLICT',
      'Contact the store operator to resolve this account.',
    );
  }
  // No provider access/refresh token is retained or returned. Require login again within one hour.
  return { user, lifetime: Math.min(result.data.expires_in, 3600) };
}

export async function supabaseRecover(env: Bindings, email: string) {
  await providerRequest(
    env,
    `recover?redirect_to=${encodeURIComponent(`${env.APP_ORIGIN}/reset-password`)}`,
    { email },
  );
}

export async function supabaseReset(env: Bindings, accessToken: string, password: string) {
  providerPassword(password);
  const identity = verifiedUser(await providerRequest(env, 'user', undefined, accessToken, 'GET'));
  const changed = verifiedUser(
    await providerRequest(env, 'user', { password }, accessToken, 'PUT'),
  );
  if (identity.id !== changed.id) {
    throw new ServiceError(401, 'INVALID_CREDENTIALS', 'Request a new recovery link.');
  }
  // Invalidate every CommerceCore session for this stable provider identity after a reset.
  await env.DB.prepare(
    `DELETE FROM sessions WHERE user_id IN
     (SELECT user_id FROM auth_identities WHERE provider=? AND subject=?)`,
  )
    .bind(supabaseConfig(env).url, identity.id)
    .run();
}
