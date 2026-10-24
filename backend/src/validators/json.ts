import type { Context } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../types.ts';
import { ServiceError } from '../services/errors.ts';

export async function readJSON<T>(
  c: Context<AppEnv>,
  schema: z.ZodType<T>,
  limit = 8192,
): Promise<T> {
  if (c.req.header('content-type')?.split(';')[0]?.trim().toLowerCase() !== 'application/json')
    throw new ServiceError(415, 'JSON_REQUIRED', 'Send an application/json request.');
  const length = c.req.header('content-length');
  if (length && (!/^\d+$/.test(length) || Number(length) > limit))
    throw new ServiceError(413, 'BODY_TOO_LARGE', 'The request is too large.');
  const reader = c.req.raw.body?.getReader();
  if (!reader) throw new ServiceError(400, 'INVALID_BODY', 'Check the form fields.');
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new ServiceError(413, 'BODY_TOO_LARGE', 'The request is too large.');
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    let body: unknown;
    try {
      body = JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes));
    } catch {
      throw new ServiceError(400, 'INVALID_BODY', 'Check the form fields.');
    }
    const result = schema.safeParse(body);
    if (!result.success)
      throw new ServiceError(400, 'INVALID_BODY', 'Check the form fields and try again.');
    return result.data;
  } finally {
    reader.releaseLock();
  }
}
