import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { z } from 'zod';
import { accountRequest } from '../account/query';
import { invalidateAdminChange } from '../../lib/query-invalidation';
import { ApiError } from '../../lib/api';

export function useAdmin<T>(userId: string | undefined, path: string, schema: z.ZodType<T>) {
  return useQuery({
    queryKey: ['admin', userId, path],
    enabled: Boolean(userId),
    retry: false,
    staleTime: 0,
    queryFn: async ({ signal }) =>
      schema.parse(await accountRequest(`/api/admin${path}`, 'GET', undefined, undefined, signal)),
  });
}
export function useAdminAction(csrf: string) {
  const cache = useQueryClient(),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [failed, setFailed] = useState(false);
  async function run(path: string, method: string, body: unknown, schema?: z.ZodType) {
    if (busy) return false;
    const parsed = schema?.safeParse(body);
    if (parsed && !parsed.success) {
      setMessage('Check the fields, prices and required values.');
      setFailed(true);
      return false;
    }
    setBusy(true);
    setMessage('');
    try {
      await accountRequest(`/api/admin${path}`, method, parsed?.data ?? body, csrf);
      await invalidateAdminChange(cache, path);
      setMessage('Saved.');
      setFailed(false);
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not save.');
      setFailed(true);
      if (error instanceof ApiError && [401, 403].includes(error.status))
        await cache.invalidateQueries({ queryKey: ['session'] });
      if (error instanceof ApiError && error.status === 409)
        await invalidateAdminChange(cache, path);
      return false;
    } finally {
      setBusy(false);
    }
  }
  return { busy, message, failed, run };
}
