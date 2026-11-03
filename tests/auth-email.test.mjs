import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, randomBytes } from 'node:crypto';
import { Miniflare } from 'miniflare';
import { app } from '../backend/src/app.ts';
import {
  verifyEmailHook,
  authEmailMessages,
  emailConfiguration,
} from '../backend/src/services/auth-email.ts';
import { applySQL } from './helpers/sql.mjs';

const secret = randomBytes(32);
const origin = 'https://commerce.example';
const provider = 'https://abcdefghijklmnopqrst.supabase.co';
const base = {
  user: { id: '79ea3b0b-c28f-4de3-b756-1510672c1734', email: 'shopper@example.test' },
  email_data: {
    email_action_type: 'signup',
    token: '123456',
    token_hash: 'a'.repeat(56),
    redirect_to: 'https://evil.example',
    site_url: 'https://evil.example',
  },
};
const envBase = {
  APP_ENV: 'production',
  AUTH_PROVIDER: 'supabase',
  PAYMENT_MODE: 'demo',
  AUTH_EMAIL_PROVIDER: 'brevo',
  APP_ORIGIN: origin,
  SUPABASE_URL: provider,
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
  AUTH_EMAIL_HOOK_SECRET: 'v1,whsec_' + secret.toString('base64'),
  BREVO_API_KEY: 'xkeysib-' + 'synthetic'.repeat(5),
  AUTH_EMAIL_FROM: 'store@example.test',
};
function signed(raw, id = crypto.randomUUID(), timestamp = String(Math.floor(Date.now() / 1000))) {
  return new Headers({
    'content-type': 'application/json',
    'webhook-id': id,
    'webhook-timestamp': timestamp,
    'webhook-signature':
      'v1,' + createHmac('sha256', secret).update(`${id}.${timestamp}.${raw}`).digest('base64'),
  });
}

test('email hook validates raw-body HMAC, timestamp, header bounds and signature rotation', async () => {
  const raw = JSON.stringify({ ...base, unicode: 'नमस्ते' }),
    headers = signed(raw);
  assert.equal(await verifyEmailHook(raw, headers, secret), headers.get('webhook-id'));
  await assert.rejects(() => verifyEmailHook(raw + ' ', headers, secret), { code: 'INVALID_HOOK' });
  for (const offset of [-301, 301])
    await assert.rejects(
      () =>
        verifyEmailHook(
          raw,
          signed(raw, 'test-event', String(Math.floor(Date.now() / 1000) + offset)),
          secret,
        ),
      { code: 'INVALID_HOOK' },
    );
  for (const name of ['webhook-id', 'webhook-timestamp', 'webhook-signature']) {
    const copy = new Headers(headers);
    copy.delete(name);
    await assert.rejects(() => verifyEmailHook(raw, copy, secret), { code: 'INVALID_HOOK' });
  }
  const rotated = new Headers(headers);
  rotated.set('webhook-signature', 'v2,ignored v1,YmFk ' + headers.get('webhook-signature'));
  assert.equal(await verifyEmailHook(raw, rotated, secret), headers.get('webhook-id'));
  const oversized = new Headers(headers);
  oversized.set('webhook-signature', 'x'.repeat(4097));
  await assert.rejects(() => verifyEmailHook(raw, oversized, secret), { code: 'INVALID_HOOK' });
  assert.throws(() =>
    emailConfiguration({ ...envBase, APP_ORIGIN: 'https://commerce.example/path' }),
  );
  assert.throws(() => emailConfiguration({ ...envBase, AUTH_EMAIL_HOOK_SECRET: 'bad-secret' }));
  assert.throws(() => emailConfiguration({ ...envBase, SUPABASE_URL: 'https://evil.example' }));
});

test('account emails pin provider and redirects and map secure email-change hashes correctly', () => {
  for (const action of ['signup', 'recovery', 'invite', 'magiclink']) {
    const message = authEmailMessages(
      { ...base, email_data: { ...base.email_data, email_action_type: action } },
      { provider, origin },
    )[0];
    const url = new URL(message.text.match(/https:\/\/\S+/)[0]);
    assert.equal(url.origin, provider);
    assert.equal(
      url.searchParams.get('redirect_to'),
      origin + (action === 'recovery' ? '/reset-password' : '/login'),
    );
    assert.equal(url.searchParams.get('type'), action);
    assert.equal(url.searchParams.get('token'), 'a'.repeat(56));
    assert.equal(message.text.includes('evil.example'), false);
  }
  const change = {
    ...base,
    user: { ...base.user, new_email: 'new@example.test' },
    email_data: {
      ...base.email_data,
      email_action_type: 'email_change',
      token_hash_new: 'b'.repeat(56),
    },
  };
  const pair = authEmailMessages(change, { provider, origin });
  assert.equal(pair[0].to, base.user.email);
  assert.ok(pair[0].text.includes('b'.repeat(56)));
  assert.equal(pair[1].to, 'new@example.test');
  assert.ok(pair[1].text.includes('a'.repeat(56)));
  delete change.email_data.token_hash_new;
  assert.equal(authEmailMessages(change, { provider, origin }).length, 1);
  const reauth = authEmailMessages(
    { ...base, email_data: { email_action_type: 'reauthentication', token: '123456' } },
    { provider, origin },
  );
  assert.ok(reauth[0].text.includes('123456'));
  for (const body of [
    {},
    { ...base, user: { ...base.user, email: 'bad' } },
    { ...base, email_data: { email_action_type: 'unknown' } },
    { ...base, email_data: { email_action_type: 'recovery', token_hash: 'bad' } },
  ])
    assert.throws(() => authEmailMessages(body, { provider, origin }));
});

test('signed email delivery uses real D1 deduplication, bounded retries and safe failures', async (t) => {
  const mf = new Miniflare({
    modules: true,
    script: 'export default {fetch(){return new Response("test")}}',
    d1Databases: ['DB'],
    compatibilityDate: '2026-08-01',
  });
  const db = await mf.getD1Database('DB');
  await applySQL(db, 'backend/db/migrations/0011_auth_email_delivery.sql');
  const env = { ...envBase, DB: db };
  let mode = 'ok',
    calls = [],
    gate,
    entered;
  const fetchMock = mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, 'https://api.brevo.com/v3/smtp/email');
    assert.equal(options.redirect, 'manual');
    assert.equal(options.headers['api-key'], envBase.BREVO_API_KEY);
    const message = JSON.parse(options.body);
    calls.push(message);
    assert.match(
      message.headers.IdempotencyKey,
      /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-a[a-f0-9]{3}-[a-f0-9]{12}$/,
    );
    if (gate) {
      entered();
      await gate;
    }
    if (mode === 'offline') throw new Error('private provider details');
    if (mode === 'retry' && calls.length === 1)
      return new Response('private-provider-body', { status: 503 });
    if (mode === 'duplicate')
      return Response.json({ code: 'duplicate_parameter' }, { status: 400 });
    if (mode === 'reject' || (mode === 'partial' && message.to[0].email === 'new@example.test'))
      return Response.json(
        { code: 'unauthorized', message: 'private-provider-body' },
        { status: 401 },
      );
    return Response.json({ messageId: 'synthetic' }, { status: 201 });
  });
  const request = (raw, headers = signed(raw), binding = env) =>
    app.request(origin + '/api/hooks/auth-email', { method: 'POST', headers, body: raw }, binding);
  try {
    await t.test('unsigned, tampered and oversized requests never send email', async () => {
      const raw = JSON.stringify(base);
      assert.equal(
        (await request(raw, new Headers({ 'content-type': 'application/json' }))).status,
        401,
      );
      assert.equal((await request(raw + ' ', signed(raw))).status, 401);
      assert.equal((await request('x'.repeat(65537), signed('x'.repeat(65537)))).status, 413);
      const mime = signed(raw);
      mime.set('content-type', 'text/plain');
      assert.equal((await request(raw, mime)).status, 415);
      assert.equal(
        (await request(raw, signed(raw), { ...env, AUTH_EMAIL_PROVIDER: undefined })).status,
        503,
      );
      assert.equal(calls.length, 0);
    });
    await t.test(
      'success and duplicate retry send exactly one email and store no sensitive payload',
      async () => {
        calls = [];
        const raw = JSON.stringify(base),
          headers = signed(raw);
        assert.equal((await request(raw, headers)).status, 200);
        assert.equal((await request(raw, headers)).status, 200);
        assert.equal(calls.length, 1);
        const rows = await db.prepare('SELECT * FROM auth_email_deliveries').all();
        const stored = JSON.stringify(rows.results);
        for (const sensitive of [
          base.user.email,
          base.email_data.token,
          base.email_data.token_hash,
          env.BREVO_API_KEY,
        ])
          assert.equal(stored.includes(sensitive), false);
        const altered = JSON.stringify({
          ...base,
          email_data: { ...base.email_data, token_hash: 'c'.repeat(56) },
        });
        assert.equal(
          (await request(altered, signed(altered, headers.get('webhook-id')))).status,
          503,
        );
        assert.equal(calls.length, 1);
      },
    );
    await t.test('concurrent duplicate requests cannot both send', async () => {
      calls = [];
      let release, started;
      gate = new Promise((resolve) => {
        release = resolve;
      });
      const providerEntered = new Promise((resolve) => {
        started = resolve;
      });
      entered = started;
      const raw = JSON.stringify(base),
        headers = signed(raw);
      const first = request(raw, headers);
      await providerEntered;
      assert.equal((await request(raw, headers)).status, 503);
      release();
      assert.equal((await first).status, 200);
      gate = undefined;
      assert.equal(calls.length, 1);
    });
    await t.test('transient failures retry with the same provider key', async () => {
      calls = [];
      mode = 'retry';
      assert.equal((await request(JSON.stringify(base))).status, 200);
      assert.equal(calls.length, 2);
      assert.equal(calls[0].headers.IdempotencyKey, calls[1].headers.IdempotencyKey);
      mode = 'duplicate';
      calls = [];
      assert.equal((await request(JSON.stringify(base))).status, 200);
      assert.equal(calls.length, 1);
    });
    await t.test(
      'provider failures stay generic, release the claim and allow a later retry',
      async () => {
        calls = [];
        mode = 'reject';
        const raw = JSON.stringify(base),
          headers = signed(raw);
        let response = await request(raw, headers);
        assert.equal(response.status, 503);
        assert.equal((await response.text()).includes('private-provider-body'), false);
        mode = 'ok';
        response = await request(raw, headers);
        assert.equal(response.status, 200);
        mode = 'offline';
        calls = [];
        response = await request(raw, signed(raw));
        assert.equal(response.status, 503);
        assert.equal(calls.length, 2);
        mode = 'ok';
      },
    );
    await t.test(
      'secure email changes send both confirmations and a completed retry sends neither again',
      async () => {
        calls = [];
        const body = {
          ...base,
          user: { ...base.user, new_email: 'new@example.test' },
          email_data: {
            ...base.email_data,
            email_action_type: 'email_change',
            token_hash_new: 'b'.repeat(56),
          },
        };
        const raw = JSON.stringify(body),
          headers = signed(raw);
        assert.equal((await request(raw, headers)).status, 200);
        assert.equal(calls.length, 2);
        assert.equal((await request(raw, headers)).status, 200);
        assert.equal(calls.length, 2);
      },
    );
    await t.test(
      'partial email-change failure retries only the undelivered recipient',
      async () => {
        calls = [];
        mode = 'partial';
        const raw = JSON.stringify({
          ...base,
          user: { ...base.user, new_email: 'new@example.test' },
          email_data: {
            ...base.email_data,
            email_action_type: 'email_change',
            token_hash_new: 'b'.repeat(56),
          },
        });
        const headers = signed(raw);
        assert.equal((await request(raw, headers)).status, 503);
        assert.equal(calls.length, 2);
        mode = 'ok';
        assert.equal((await request(raw, headers)).status, 200);
        assert.equal(calls.length, 3);
        assert.equal(calls[2].to[0].email, 'new@example.test');
      },
    );
  } finally {
    fetchMock.mock.restore();
    await mf.dispose();
  }
});
