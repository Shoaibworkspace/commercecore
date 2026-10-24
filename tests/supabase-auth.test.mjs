import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readdirSync } from 'node:fs';
import { Miniflare } from 'miniflare';
import { app } from '../worker/app.ts';
import { applySQL } from './helpers/sql.mjs';
import { supabaseConfig, supabaseLogin } from '../worker/services/supabase.ts';

test('Supabase provider configuration pins credential destination', () => {
  for (const url of [
    'http://example.com',
    'https://evil.test',
    'https://abcdefghijklmnopqrst.supabase.co/extra',
  ]) {
    assert.throws(() =>
      supabaseConfig({ SUPABASE_URL: url, SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test' }),
    );
  }
});

test('provider redirect policy uses a mode supported by the actual Worker runtime', async () => {
  const mf = new Miniflare({
    modules: true,
    compatibilityDate: '2026-08-01',
    script: `export default {fetch(){
      const modes={};
      for(const mode of ['manual','error']) {
        try { new Request('https://example.test/',{redirect:mode}); modes[mode]=true; }
        catch { modes[mode]=false; }
      }
      return Response.json(modes);
    }}`,
  });
  try {
    const modes = await (await mf.dispatchFetch('http://runtime.test/')).json();
    assert.equal(modes.manual, true);
  } finally {
    await mf.dispose();
  }
});

test('hosted authentication preserves session, CSRF, role and identity boundaries on real D1', async () => {
  const mf = new Miniflare({
    modules: true,
    script: 'export default {fetch(){return new Response("test")}}',
    d1Databases: ['DB'],
    compatibilityDate: '2026-08-01',
  });
  const provider = 'https://abcdefghijklmnopqrst.supabase.co';
  const origin = 'https://commerce.example';
  let providerMode = 'ok';
  let calls = 0;
  const identity = {
    id: '79ea3b0b-c28f-4de3-b756-1510672c1734',
    email: 'demo@example.test',
    email_confirmed_at: '2026-10-23T00:00:00Z',
    user_metadata: { name: 'Demo Shopper', role: 'admin' },
  };
  const fetchMock = mock.method(globalThis, 'fetch', async (url, options) => {
    calls++;
    assert.ok(String(url).startsWith(provider + '/auth/v1/'));
    assert.equal(options.redirect, 'manual');
    assert.equal(options.headers.apikey, 'sb_publishable_test');
    if (providerMode === 'offline') throw new Error('private provider failure');
    if (providerMode === 'redirect')
      return new Response(null, { status: 302, headers: { Location: 'https://evil.example' } });
    if (String(url).includes('token?')) {
      if (providerMode === 'wrong')
        return Response.json({ msg: 'private provider error' }, { status: 400 });
      return Response.json({
        access_token: 'synthetic-token-for-tests-only',
        expires_in: 7200,
        user: providerMode === 'unverified' ? { ...identity, email_confirmed_at: null } : identity,
      });
    }
    if (String(url).endsWith('/user')) {
      assert.match(options.headers.Authorization, /^Bearer /);
      return Response.json(identity);
    }
    return Response.json({});
  });
  try {
    const db = await mf.getD1Database('DB');
    for (const file of readdirSync('db/migrations')
      .filter((f) => f.endsWith('.sql'))
      .sort())
      await applySQL(db, `db/migrations/${file}`);
    const env = {
      DB: db,
      APP_ENV: 'production',
      PAYMENT_MODE: 'demo',
      APP_ORIGIN: origin,
      AUTH_PUBLIC_ENABLED: 'verified',
      AUTH_PROVIDER: 'supabase',
      SUPABASE_URL: provider,
      SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
      AUTH_SECRET: randomBytes(32).toString('hex'),
    };
    const jar = new Map();
    let csrf = '';
    async function request(path, body, overrides = {}) {
      const response = await app.request(
        origin + path,
        {
          method: body ? 'POST' : 'GET',
          headers: {
            Origin: origin,
            Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; '),
            'Content-Type': 'application/json',
            'X-CSRF-Token': csrf,
            ...overrides,
          },
          body: body ? JSON.stringify(body) : undefined,
        },
        env,
      );
      for (const value of response.headers.getSetCookie()) {
        const cookie = value.split(';')[0];
        const index = cookie.indexOf('=');
        jar.set(cookie.slice(0, index), cookie.slice(index + 1));
      }
      return response;
    }
    csrf = (await (await request('/api/auth/session')).json()).data.csrfToken;
    const input = { email: identity.email, password: 'Synthetic long password 2026!' };
    let response = await request('/api/auth/register', { ...input, name: 'Demo Shopper' });
    assert.equal(response.status, 201);
    assert.equal((await response.json()).data.verificationRequired, true);
    assert.equal((await db.prepare('SELECT count(*) AS n FROM users').first()).n, 0);
    const beforeCSRF = calls;
    assert.equal((await request('/api/auth/login', input, { 'X-CSRF-Token': 'bad' })).status, 403);
    assert.equal(calls, beforeCSRF);
    providerMode = 'unverified';
    assert.equal((await request('/api/auth/login', input)).status, 401);
    assert.equal((await db.prepare('SELECT count(*) AS n FROM sessions').first()).n, 0);
    providerMode = 'wrong';
    response = await request('/api/auth/login', input);
    assert.equal(response.status, 400);
    assert.ok(!(await response.text()).includes('private provider error'));
    providerMode = 'ok';
    response = await request('/api/auth/login', input);
    assert.equal(response.status, 200);
    const text = await response.clone().text();
    assert.ok(!text.includes('synthetic-token'));
    const session = (await response.json()).data;
    csrf = session.csrfToken;
    assert.equal(session.user.role, 'customer');
    assert.equal(session.authProvider, 'supabase');
    assert.match(response.headers.get('set-cookie'), /Secure/);
    assert.match(response.headers.get('set-cookie'), /HttpOnly/);
    const row = await db.prepare('SELECT expires_at-created_at AS lifetime FROM sessions').first();
    assert.equal(row.lifetime, 3600);
    assert.equal((await request('/api/me')).status, 200);
    assert.equal((await request('/api/admin/status')).status, 403);
    assert.equal(
      (await db.prepare('SELECT password_hash FROM users').first()).password_hash,
      'external:supabase',
    );
    providerMode = 'offline';
    assert.equal((await request('/api/auth/login', input)).status, 503);
    providerMode = 'redirect';
    assert.equal((await request('/api/auth/login', input)).status, 503);
    providerMode = 'ok';
    assert.equal((await request('/api/auth/recover', { email: identity.email })).status, 200);
    assert.equal(
      (
        await request('/api/auth/reset-password', {
          accessToken: 'synthetic-token-for-tests-only',
          password: 'Another long passphrase 2026!',
        })
      ).status,
      200,
    );
    assert.equal((await db.prepare('SELECT count(*) AS n FROM sessions').first()).n, 0);
    assert.equal((await request('/api/me')).status, 401);
    assert.equal((await db.prepare('SELECT count(*) AS n FROM auth_identities').first()).n, 1);
    const beforeLongPassword = calls;
    await assert.rejects(
      () => supabaseLogin(env, { email: identity.email, password: 'x'.repeat(73) }),
      { code: 'INVALID_PASSWORD' },
    );
    assert.equal(calls, beforeLongPassword);
    const originalId = identity.id;
    identity.id = 'd4f1ab7a-81cf-40bc-afcd-c3b86eb0b71f';
    await assert.rejects(() => supabaseLogin(env, input), { code: 'ACCOUNT_CONFLICT' });
    identity.id = originalId;
    assert.equal((await db.prepare('SELECT count(*) AS n FROM users').first()).n, 1);
    assert.equal((await db.prepare('SELECT count(*) AS n FROM auth_identities').first()).n, 1);
    assert.deepEqual((await db.prepare('PRAGMA foreign_key_check').all()).results, []);
  } finally {
    fetchMock.mock.restore();
    await mf.dispose();
  }
});
