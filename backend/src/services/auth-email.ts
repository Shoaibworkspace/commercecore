import { z } from 'zod';
import type { Bindings } from '../types.ts';
import { ServiceError } from './errors.ts';
import { sha256 } from './crypto.ts';
import { supabaseConfig } from './supabase.ts';

const unavailable = () =>
  new ServiceError(
    503,
    'EMAIL_UNAVAILABLE',
    'Account email could not be sent. Please try again later.',
  );
const invalid = () => new ServiceError(401, 'INVALID_HOOK', 'Invalid email request.');
const hash = z.string().regex(/^[A-Za-z0-9_-]{20,256}$/);
const payloadSchema = z.object({
  user: z.object({
    id: z.uuid(),
    email: z.email().max(254),
    new_email: z.string().max(254).nullable().optional(),
  }),
  email_data: z.object({
    email_action_type: z.enum([
      'signup',
      'recovery',
      'magiclink',
      'invite',
      'email_change',
      'reauthentication',
    ]),
    token_hash: z.string().max(256).optional(),
    token_hash_new: z.string().max(256).optional(),
    token: z.string().max(16).optional(),
    token_new: z.string().max(16).optional(),
  }),
});

export function emailConfiguration(env: Bindings) {
  if (
    env.AUTH_EMAIL_PROVIDER !== 'brevo' ||
    !env.BREVO_API_KEY?.startsWith('xkeysib-') ||
    !env.AUTH_EMAIL_HOOK_SECRET ||
    !z.email().safeParse(env.AUTH_EMAIL_FROM).success
  )
    throw unavailable();
  const provider = supabaseConfig(env).url;
  let origin: URL;
  try {
    origin = new URL(env.APP_ORIGIN ?? '');
  } catch {
    throw unavailable();
  }
  if (origin.protocol !== 'https:' || origin.origin !== env.APP_ORIGIN) throw unavailable();
  const encoded = env.AUTH_EMAIL_HOOK_SECRET.replace(/^v1,/, '').replace(/^whsec_/, '');
  let secret: Uint8Array;
  try {
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) throw unavailable();
    secret = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
  } catch {
    throw unavailable();
  }
  if (secret.length < 32) throw unavailable();
  return { provider, origin: origin.origin, secret };
}

export async function verifyEmailHook(raw: string, headers: Headers, secret: Uint8Array) {
  const id = headers.get('webhook-id') ?? '';
  const timestamp = headers.get('webhook-timestamp') ?? '';
  const signatures = headers.get('webhook-signature') ?? '';
  if (
    !/^[A-Za-z0-9_.:-]{1,200}$/.test(id) ||
    !/^\d{10}$/.test(timestamp) ||
    Math.abs(Date.now() / 1000 - Number(timestamp)) > 300 ||
    signatures.length > 4096
  )
    throw invalid();
  const key = await crypto.subtle.importKey(
    'raw',
    secret as BufferSource,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  const message = new TextEncoder().encode(`${id}.${timestamp}.${raw}`);
  for (const part of signatures.split(' ')) {
    if (!/^v1,[A-Za-z0-9+/]+={0,2}$/.test(part)) continue;
    try {
      const signature = Uint8Array.from(atob(part.slice(3)), (c) => c.charCodeAt(0));
      if (await crypto.subtle.verify('HMAC', key, signature, message)) return id;
    } catch {
      /* Reject malformed signatures without logging them. */
    }
  }
  throw invalid();
}

export function authEmailMessages(value: unknown, config: { provider: string; origin: string }) {
  const payload = payloadSchema.safeParse(value);
  if (!payload.success)
    throw new ServiceError(400, 'INVALID_HOOK_BODY', 'Unsupported account email.');
  const { user, email_data: data } = payload.data;
  const action = data.email_action_type;
  const make = (to: string, tokenHash?: string, token?: string) => {
    if (action === 'reauthentication') {
      if (!/^\d{6,10}$/.test(token ?? ''))
        throw new ServiceError(400, 'INVALID_HOOK_BODY', 'Unsupported account email.');
      return {
        to,
        subject: 'CommerceCore — confirm your identity',
        text: `Your CommerceCore security code is ${token}. Do not share this code. If you did not request it, ignore this email.`,
      };
    }
    if (!hash.safeParse(tokenHash).success)
      throw new ServiceError(400, 'INVALID_HOOK_BODY', 'Unsupported account email.');
    const url = new URL('/auth/v1/verify', config.provider);
    url.searchParams.set('token', tokenHash!);
    url.searchParams.set('type', action);
    // Never trust a caller-supplied redirect, site URL, template or email body.
    url.searchParams.set(
      'redirect_to',
      config.origin + (action === 'recovery' ? '/reset-password' : '/login'),
    );
    const recovery = action === 'recovery';
    return {
      to,
      subject: recovery
        ? 'CommerceCore — reset your password'
        : action === 'email_change'
          ? 'CommerceCore — confirm your email change'
          : 'CommerceCore — confirm your email address',
      text: `${recovery ? 'Choose a new CommerceCore password' : 'Confirm your CommerceCore email'} using this link:\n\n${url.href}\n\nIf you did not request this, ignore this email. This is a demo store; no payment is involved.`,
    };
  };
  if (action === 'email_change') {
    const next = z.email().safeParse(user.new_email);
    if (!next.success)
      throw new ServiceError(400, 'INVALID_HOOK_BODY', 'Unsupported account email.');
    // Supabase's secure-email-change hashes are intentionally counterintuitive.
    return data.token_hash_new
      ? [make(user.email, data.token_hash_new), make(next.data, data.token_hash)]
      : [make(next.data, data.token_hash)];
  }
  return [make(user.email, data.token_hash, data.token)];
}

export async function deliverAuthEmail(env: Bindings, raw: string, headers: Headers) {
  const config = emailConfiguration(env);
  const eventId = await verifyEmailHook(raw, headers, config.secret);
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new ServiceError(400, 'INVALID_HOOK_BODY', 'Invalid account email.');
  }
  const messages = authEmailMessages(value, config);
  const fingerprint = await sha256(raw);
  const db = env.DB.withSession('first-primary');
  await db
    .prepare(
      'DELETE FROM auth_email_deliveries WHERE id IN (SELECT id FROM auth_email_deliveries WHERE updated_at < unixepoch()-86400 LIMIT 20)',
    )
    .run();
  const deliveries = await Promise.allSettled(
    messages.map(async (message) => {
      const id = await sha256(`${eventId}\n${message.to}`);
      const owner = crypto.randomUUID();
      const claimed = await db
        .prepare(
          `INSERT INTO auth_email_deliveries(id,payload_hash,status,owner,lease_until) VALUES (?,?,'sending',?,unixepoch()+15)
      ON CONFLICT(id) DO UPDATE SET owner=excluded.owner,lease_until=excluded.lease_until,updated_at=unixepoch()
      WHERE auth_email_deliveries.status='sending' AND auth_email_deliveries.lease_until < unixepoch() AND auth_email_deliveries.payload_hash=excluded.payload_hash RETURNING id`,
        )
        .bind(id, fingerprint, owner)
        .first();
      if (!claimed) {
        const previous = await db
          .prepare('SELECT payload_hash,status FROM auth_email_deliveries WHERE id=?')
          .bind(id)
          .first<{ payload_hash: string; status: string }>();
        if (previous?.status === 'sent' && previous.payload_hash === fingerprint) return;
        throw unavailable();
      }
      try {
        // A stable provider key also covers retry after an ambiguous network failure.
        const key = `${id.slice(0, 8)}-${id.slice(8, 12)}-4${id.slice(13, 16)}-a${id.slice(17, 20)}-${id.slice(20, 32)}`;
        let response: Response | undefined;
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            response = await fetch('https://api.brevo.com/v3/smtp/email', {
              method: 'POST',
              redirect: 'manual',
              signal: AbortSignal.timeout(1500),
              headers: {
                'api-key': env.BREVO_API_KEY!,
                accept: 'application/json',
                'content-type': 'application/json',
              },
              body: JSON.stringify({
                sender: { email: env.AUTH_EMAIL_FROM, name: 'CommerceCore' },
                to: [{ email: message.to }],
                subject: message.subject,
                textContent: message.text,
                headers: { IdempotencyKey: key },
                tags: ['commercecore-auth'],
              }),
            });
          } catch {
            response = undefined;
          }
          if (response && response.status < 500) break;
        }
        let accepted = response?.status === 201;
        if (response?.status === 400) {
          try {
            const failure = (await response.json()) as { code?: string };
            // Brevo documents this code when the same idempotency key was already accepted.
            accepted = failure.code === 'duplicate_parameter';
          } catch {
            /* Do not retain or echo provider response bodies. */
          }
        }
        if (!accepted) {
          console.warn(
            JSON.stringify({
              event: 'auth_email_failed',
              kind: response ? 'provider_http' : 'provider_network',
              status: response?.status,
            }),
          );
          throw unavailable();
        }
        const saved = await db
          .prepare(
            "UPDATE auth_email_deliveries SET status='sent',updated_at=unixepoch(),lease_until=0 WHERE id=? AND owner=? AND status='sending'",
          )
          .bind(id, owner)
          .run();
        if (saved.meta.changes !== 1) throw unavailable();
      } catch {
        await db
          .prepare("DELETE FROM auth_email_deliveries WHERE id=? AND owner=? AND status='sending'")
          .bind(id, owner)
          .run();
        throw unavailable();
      }
    }),
  );
  if (deliveries.some((result) => result.status === 'rejected')) throw unavailable();
}
