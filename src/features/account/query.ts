import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { addressesSchema, meSchema, sessionSchema } from '../../../shared/account.ts';
import { ApiError } from '../../lib/api';

const errorSchema = z.object({ error: z.object({ message: z.string().max(500) }) });
export async function accountRequest(
  path: string,
  method = 'GET',
  body?: unknown,
  csrfToken?: string,
  signal?: AbortSignal,
  extraHeaders: Record<string, string> = {},
): Promise<unknown> {
  const response = await fetch(path, {
    method,
    credentials: 'same-origin',
    signal,
    headers: {
      ...extraHeaders,
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (response.status === 204) return undefined;
  if (!response.headers.get('content-type')?.includes('application/json'))
    throw new ApiError(response.status, 'Account service is unavailable. Please try again.');
  const result: unknown = await response.json();
  if (!response.ok)
    throw new ApiError(
      response.status,
      errorSchema.safeParse(result).data?.error.message ?? 'The request could not be completed.',
    );
  return result;
}
export function useSession() {
  return useQuery({
    queryKey: ['session'],
    queryFn: async ({ signal }) =>
      sessionSchema.parse(
        await accountRequest('/api/auth/session', 'GET', undefined, undefined, signal),
      ).data,
    staleTime: 0,
    retry: false,
    refetchOnWindowFocus: true,
  });
}
export function useProfile(userId: string | undefined) {
  return useQuery({
    queryKey: ['profile', userId],
    enabled: Boolean(userId),
    queryFn: async ({ signal }) =>
      meSchema.parse(await accountRequest('/api/me', 'GET', undefined, undefined, signal)).data,
    staleTime: 0,
    retry: false,
  });
}
export function useAddresses(userId: string | undefined) {
  return useQuery({
    queryKey: ['addresses', userId],
    enabled: Boolean(userId),
    queryFn: async ({ signal }) =>
      addressesSchema.parse(
        await accountRequest('/api/me/addresses', 'GET', undefined, undefined, signal),
      ).data,
    staleTime: 0,
    retry: false,
  });
}
