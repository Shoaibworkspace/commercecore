import { Hono } from 'hono';
import type { AppEnv } from '../types.ts';
import { deliverAuthEmail } from '../services/auth-email.ts';
import { ServiceError } from '../services/errors.ts';

export const authEmailRoutes = new Hono<AppEnv>();
authEmailRoutes.post('/hooks/auth-email', async (c) => {
  // Server-to-server endpoint: raw-body signature replaces browser Origin/CSRF.
  // Read at most 64 KiB even when Content-Length is absent or spoofed.
  if (c.req.header('content-type')?.split(';')[0]?.trim().toLowerCase() !== 'application/json')
    throw new ServiceError(415, 'JSON_REQUIRED', 'Send JSON.');
  const reader = c.req.raw.body?.getReader();
  if (!reader) throw new ServiceError(400, 'INVALID_BODY', 'Invalid email request.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 65536) {
        await reader.cancel();
        throw new ServiceError(413, 'BODY_TOO_LARGE', 'The request is too large.');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  let raw: string;
  try {
    raw = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    throw new ServiceError(400, 'INVALID_BODY', 'Invalid email request.');
  }
  await deliverAuthEmail(c.env, raw, c.req.raw.headers);
  return c.json({});
});
