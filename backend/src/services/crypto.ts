import { pbkdf2, timingSafeEqual } from 'node:crypto';

export const PASSWORD_ITERATIONS = 600000;
export const randomToken = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');
const hex = (value: ArrayBuffer) =>
  Array.from(new Uint8Array(value), (b) => b.toString(16).padStart(2, '0')).join('');
export const sha256 = async (value: string) =>
  hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
export async function hmac(secret: string, value: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value)));
}
export function equal(a: string, b: string) {
  const left = new TextEncoder().encode(a),
    right = new TextEncoder().encode(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
function derive(password: string, salt: string) {
  return new Promise<string>((resolve, reject) =>
    pbkdf2(password, salt, PASSWORD_ITERATIONS, 32, 'sha256', (error, key) =>
      error ? reject(error) : resolve(key.toString('hex')),
    ),
  );
}
export async function hashPassword(password: string) {
  const salt = randomToken();
  return `pbkdf2-sha256$v1$${PASSWORD_ITERATIONS}$${salt}$${await derive(password, salt)}`;
}
export async function verifyPassword(password: string, encoded: string | undefined) {
  const parts = encoded?.match(/^pbkdf2-sha256\$v1\$600000\$([0-9a-f]{64})\$([0-9a-f]{64})$/);
  // Unknown accounts and invalid legacy hashes still pay the same work factor.
  const derived = await derive(password, parts?.[1] ?? '0'.repeat(64));
  return Boolean(parts && equal(derived, parts[2]!));
}
