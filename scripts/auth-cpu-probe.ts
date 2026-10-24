import { equal, hashPassword, verifyPassword } from '../worker/services/crypto.ts';

// Isolated synthetic benchmark: no D1 binding, user input or account creation.
export default {
  async fetch(request: Request, env: { PROBE_TOKEN: string }) {
    if (
      request.method !== 'POST' ||
      !env.PROBE_TOKEN ||
      !equal(request.headers.get('X-Probe-Token') ?? '', env.PROBE_TOKEN)
    ) {
      return new Response('Not found', { status: 404 });
    }
    const mode = new URL(request.url).pathname;
    if (mode === '/register') {
      await hashPassword('synthetic-probe-only-passphrase');
    } else if (mode === '/unknown-login') {
      await verifyPassword('synthetic-probe-only-passphrase', undefined);
    } else {
      return new Response('Not found', { status: 404 });
    }
    return Response.json({ completed: true, iterations: 600000, mode });
  },
};
