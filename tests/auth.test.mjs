import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { Miniflare } from 'miniflare';
import { readFileSync } from 'node:fs';
import { app } from '../worker/app.ts';
import { applySQL } from './helpers/sql.mjs';
import { sha256, hashPassword, verifyPassword, hmac } from '../worker/services/crypto.ts';
import { sessionSchema, meSchema, addressesSchema } from '../shared/account.ts';

const password = 'Demo-only long passphrase 2026!';
const addressInput = {
  recipient: 'Demo Recipient',
  line1: '12 Sample Lane',
  line2: 'Unit 2',
  city: 'Demo City',
  region: 'Demo State',
  postalCode: '110001',
  countryCode: 'IN',
  phone: '5551234567',
  isDefault: false,
};
const cookieValue = (cookie, name) =>
  cookie
    .split('; ')
    .find((item) => item.startsWith(`${name}=`))
    ?.slice(name.length + 1);

test('strong password format, unique salts, correct/wrong/legacy verification and Unicode', async () => {
  const a = await hashPassword(password),
    b = await hashPassword(password);
  assert.match(a, /^pbkdf2-sha256\$v1\$600000\$[0-9a-f]{64}\$[0-9a-f]{64}$/);
  assert.notEqual(a, b);
  assert.equal(await verifyPassword(password, a), true);
  assert.equal(await verifyPassword('wrong', a), false);
  assert.equal(await verifyPassword(password, 'legacy-weak-hash'), false);
  const unicode = 'अच्छी लंबी पासफ्रेज़ 🔒 2026';
  assert.equal(await verifyPassword(unicode, await hashPassword(unicode)), true);
});

test('accounts, sessions, authorization, CSRF and address integration on real D1', async (suite) => {
  const config = JSON.parse(readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8'));
  const mf = new Miniflare({
    modules: true,
    script: 'export default {fetch(){return new Response("test");}}',
    compatibilityDate: config.compatibility_date,
    d1Databases: ['DB'],
  });
  try {
    const db = await mf.getD1Database('DB');
    for (const file of [
      '0001_initial.sql',
      '0002_catalog.sql',
      '0009_catalog_sale_prices.sql',
      '0003_accounts.sql',
    ])
      await applySQL(db, `db/migrations/${file}`);
    const env = {
      DB: db,
      APP_ENV: 'development',
      PAYMENT_MODE: 'demo',
      AUTH_SECRET: randomBytes(32).toString('hex'),
    };
    function client(settings = env, origin = 'http://localhost') {
      const jar = new Map();
      let csrf = '';
      return {
        jar,
        get csrf() {
          return csrf;
        },
        set csrf(value) {
          csrf = value;
        },
        get cookie() {
          return [...jar].map(([key, value]) => `${key}=${value}`).join('; ');
        },
        async request(path, method = 'GET', body, extra = {}) {
          const headers = {
            cookie: this.cookie,
            ...(method !== 'GET' ? { origin, 'x-csrf-token': csrf } : {}),
            ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
            ...extra,
          };
          const response = await app.request(
            `${origin}/api${path}`,
            {
              method,
              headers,
              body:
                body === undefined
                  ? undefined
                  : typeof body === 'string'
                    ? body
                    : JSON.stringify(body),
            },
            settings,
          );
          for (const cookie of response.headers.getSetCookie()) {
            const pair = cookie.split(';')[0],
              index = pair.indexOf('=');
            if (/Max-Age=0/i.test(cookie)) jar.delete(pair.slice(0, index));
            else jar.set(pair.slice(0, index), pair.slice(index + 1));
          }
          return response;
        },
        async boot() {
          const response = await this.request('/auth/session');
          assert.equal(response.status, 200, await response.clone().text());
          const data = sessionSchema.parse(await response.json()).data;
          csrf = data.csrfToken;
          return data;
        },
        async register(email, name = 'Demo Customer') {
          await this.boot();
          const response = await this.request('/auth/register', 'POST', { name, email, password });
          if (response.status === 201)
            csrf = sessionSchema.parse(await response.clone().json()).data.csrfToken;
          return response;
        },
        async login(email, pass = password) {
          await this.boot();
          const response = await this.request('/auth/login', 'POST', { email, password: pass });
          if (response.status === 200)
            csrf = sessionSchema.parse(await response.clone().json()).data.csrfToken;
          return response;
        },
      };
    }
    const check = (name, run) =>
      suite.test(name, async () => {
        await db.prepare('DELETE FROM auth_rate_limits').run();
        await run();
      });
    const alice = client(),
      bob = client();
    let aliceId, bobId;

    await check(
      'anonymous session boot issues a signed HttpOnly CSRF cookie and no user',
      async () => {
        const data = await alice.boot();
        assert.equal(data.user, null);
        assert.match(data.csrfToken, /^[0-9a-f]{64}\.\d{10}\.[0-9a-f]{64}$/);
        const response = await client().request('/auth/session');
        assert.match(response.headers.get('set-cookie'), /HttpOnly/i);
        assert.match(response.headers.get('set-cookie'), /SameSite=Lax/i);
        assert.equal(response.headers.get('cache-control'), 'no-store');
        const again = await alice.boot();
        assert.equal(again.csrfToken, data.csrfToken);
      },
    );
    await check(
      'register normalizes email, defaults role to customer and persists hashes only',
      async () => {
        const response = await alice.register(' ALICE@EXAMPLE.TEST ');
        assert.equal(response.status, 201, await response.clone().text());
        const result = sessionSchema.parse(await response.json()).data;
        aliceId = result.user.id;
        assert.equal(result.user.email, 'alice@example.test');
        assert.equal(result.user.role, 'customer');
        const cookies = response.headers.getSetCookie().join(';');
        assert.match(cookies, /cc_session=/);
        assert.match(cookies, /HttpOnly/);
        assert.match(cookies, /Path=\//);
        assert.match(cookies, /SameSite=Lax/);
        assert.doesNotMatch(JSON.stringify(result), /password_hash|token_hash|last_seen/);
        const user = await db
          .prepare('SELECT password_hash FROM users WHERE id=?')
          .bind(aliceId)
          .first();
        assert.notEqual(user.password_hash, password);
        assert.match(user.password_hash, /600000/);
        const session = await db
          .prepare('SELECT token_hash,csrf_token_hash FROM sessions WHERE user_id=?')
          .bind(aliceId)
          .first();
        assert.equal(session.token_hash, await sha256(cookieValue(alice.cookie, 'cc_session')));
        assert.equal(session.csrf_token_hash, await sha256(alice.csrf));
        const bobResponse = await bob.register('bob@example.test', 'Other Demo Customer');
        assert.equal(bobResponse.status, 201);
        bobId = (await bobResponse.json()).data.user.id;
      },
    );
    await check(
      'password requirements, invalid email and privilege-injection bodies are rejected',
      async () => {
        const visitor = client();
        await visitor.boot();
        for (const input of [
          { name: 'X', email: 'bad', password },
          { name: 'X', email: 'x@example.test', password: 'short' },
          { name: 'X', email: 'x@example.test', password: '123456789012345' },
          { name: 'X', email: 'x@example.test', password: 'a'.repeat(129) },
          { name: 'X', email: 'x@example.test', password, role: 'admin' },
          { name: 'X', email: 'x@example.test', password, id: 'alice' },
        ])
          assert.equal((await visitor.request('/auth/register', 'POST', input)).status, 400);
        assert.equal(
          (await db.prepare("SELECT COUNT(*) AS n FROM users WHERE email='x@example.test'").first())
            .n,
          0,
        );
      },
    );
    await check('duplicate email is rejected without creating a second account', async () => {
      const visitor = client();
      const response = await visitor.register('ALICE@example.test');
      assert.equal(response.status, 409);
      assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM users').first()).n, 2);
    });
    await check('login handles valid and invalid credentials with one generic error', async () => {
      const visitor = client();
      const wrong = await visitor.login('alice@example.test', 'wrong password');
      const missing = await visitor.login('missing@example.test', 'wrong password');
      assert.equal(wrong.status, 401);
      assert.equal(missing.status, 401);
      assert.equal((await wrong.json()).error.message, (await missing.json()).error.message);
      const valid = await visitor.login('ALICE@example.test');
      assert.equal(valid.status, 200);
      assert.equal(sessionSchema.parse(await valid.json()).data.user.id, aliceId);
    });
    await check(
      'login rotates the current session; old token is revoked and new token survives reload',
      async () => {
        const old = alice.cookie;
        const response = await alice.login('alice@example.test');
        assert.equal(response.status, 200);
        assert.notEqual(alice.cookie, old);
        assert.equal((await app.request('/api/me', { headers: { cookie: old } }, env)).status, 401);
        assert.equal((await alice.boot()).user.id, aliceId);
        assert.equal((await alice.request('/me')).status, 200);
      },
    );
    await check(
      'anonymous and customer admin access fail independently of spoofed client role',
      async () => {
        assert.equal((await client().request('/me')).status, 401);
        assert.equal((await client().request('/admin/status')).status, 401);
        assert.equal(
          (await alice.request('/admin/status', 'GET', undefined, { 'x-role': 'admin' })).status,
          403,
        );
        assert.equal(
          (await alice.request('/admin/products', 'POST', { role: 'admin' })).status,
          403,
        );
      },
    );
    await check(
      'administrator role is read from the database and demotion takes immediate effect',
      async () => {
        await db.prepare("UPDATE users SET role='admin' WHERE id=?").bind(bobId).run();
        assert.equal((await bob.request('/admin/status')).status, 200);
        await db.prepare("UPDATE users SET role='customer' WHERE id=?").bind(bobId).run();
        assert.equal((await bob.request('/admin/status')).status, 403);
      },
    );
    await check(
      'profile ownership/version checks prevent role, email and user-ID injection',
      async () => {
        const profile = meSchema.parse(await (await alice.request('/me')).json()).data;
        assert.equal(
          (
            await alice.request('/me', 'PATCH', {
              name: 'Updated Demo Customer',
              version: profile.version,
            })
          ).status,
          200,
        );
        assert.equal(
          (await alice.request('/me', 'PATCH', { name: 'Stale edit', version: profile.version }))
            .status,
          409,
        );
        for (const extra of [{ role: 'admin' }, { email: 'bob@example.test' }, { id: bobId }])
          assert.equal(
            (
              await alice.request('/me', 'PATCH', {
                name: 'Unsafe',
                version: profile.version + 1,
                ...extra,
              })
            ).status,
            400,
          );
        assert.equal(
          (await db.prepare('SELECT name FROM users WHERE id=?').bind(bobId).first()).name,
          'Other Demo Customer',
        );
      },
    );
    await check(
      'mutation CSRF rejects absent/wrong token, cross-origin, missing Origin and cross-site fetch',
      async () => {
        for (const headers of [
          { 'x-csrf-token': '' },
          { 'x-csrf-token': 'a'.repeat(64) },
          { origin: 'https://evil.test' },
          { origin: '' },
          { 'sec-fetch-site': 'cross-site' },
        ])
          assert.equal(
            (await alice.request('/me', 'PATCH', { name: 'Rejected', version: 1 }, headers)).status,
            403,
          );
        const visitor = client();
        await visitor.boot();
        assert.equal(
          (
            await visitor.request(
              '/auth/login',
              'POST',
              { email: 'alice@example.test', password },
              { 'x-csrf-token': 'bad' },
            )
          ).status,
          403,
        );
        assert.equal(
          (
            await visitor.request(
              '/auth/register',
              'POST',
              { name: 'CSRF', email: 'csrf@example.test', password },
              { origin: 'null' },
            )
          ).status,
          403,
        );
      },
    );
    await check('tampered and expired signed pre-auth cookies are denied', async () => {
      const visitor = client();
      await visitor.boot();
      const payload = `${'a'.repeat(64)}.${Math.floor(Date.now() / 1000) - 10}`;
      const expired = `${payload}.${await hmac(env.AUTH_SECRET, `preauth:v1:${payload}`)}`;
      visitor.jar.set('cc_preauth', expired);
      visitor.csrf = expired;
      assert.equal(
        (await visitor.request('/auth/login', 'POST', { email: 'alice@example.test', password }))
          .status,
        403,
      );
      visitor.jar.set('cc_preauth', `${payload}.${'0'.repeat(64)}`);
      visitor.csrf = visitor.jar.get('cc_preauth');
      assert.equal(
        (await visitor.request('/auth/login', 'POST', { email: 'alice@example.test', password }))
          .status,
        403,
      );
    });
    await check('JSON/MIME/body-size limits reject malformed and oversized requests', async () => {
      const visitor = client();
      await visitor.boot();
      assert.equal((await visitor.request('/auth/login', 'POST', '{')).status, 400);
      assert.equal(
        (
          await visitor.request(
            '/auth/login',
            'POST',
            { email: 'alice@example.test', password },
            { 'content-type': 'text/plain' },
          )
        ).status,
        415,
      );
      assert.equal((await visitor.request('/auth/login', 'POST', 'x'.repeat(9000))).status, 413);
      assert.equal(
        (
          await visitor.request(
            '/auth/login',
            'POST',
            { email: 'alice@example.test', password },
            { 'content-length': '9001' },
          )
        ).status,
        413,
      );
    });
    await check(
      'create/edit/default/delete addresses persist and preserve one default',
      async () => {
        const first = await alice.request('/me/addresses', 'POST', addressInput);
        assert.equal(first.status, 201, await first.clone().text());
        const a = (await first.json()).data;
        assert.equal(a.isDefault, true);
        const second = await alice.request('/me/addresses', 'POST', {
          ...addressInput,
          recipient: 'Second Demo',
          isDefault: true,
        });
        assert.equal(second.status, 201);
        const b = (await second.json()).data;
        let list = addressesSchema.parse(await (await alice.request('/me/addresses')).json()).data;
        assert.equal(list.length, 2);
        assert.equal(list.filter((a) => a.isDefault).length, 1);
        assert.equal(list.find((a) => a.id === b.id).isDefault, true);
        const old = list.find((item) => item.id === a.id);
        assert.equal(
          (
            await alice.request(`/me/addresses/${a.id}`, 'PATCH', {
              ...addressInput,
              city: 'Updated City',
              isDefault: true,
              version: old.version,
            })
          ).status,
          200,
        );
        assert.equal(
          (
            await alice.request(`/me/addresses/${a.id}`, 'PATCH', {
              ...addressInput,
              version: old.version,
            })
          ).status,
          409,
        );
        list = addressesSchema.parse(await (await alice.request('/me/addresses')).json()).data;
        assert.equal(list.find((a) => a.id === old.id).city, 'Updated City');
        assert.equal(list.filter((a) => a.isDefault).length, 1);
        const target = list.find((item) => item.id === b.id);
        assert.equal(
          (await alice.request(`/me/addresses/${b.id}`, 'DELETE', { version: target.version }))
            .status,
          204,
        );
        assert.equal(
          addressesSchema.parse(await (await alice.request('/me/addresses')).json()).data.length,
          1,
        );
      },
    );
    await check(
      'address ownership is enforced; attacker cannot read, edit, delete or assign another owner',
      async () => {
        const target = addressesSchema.parse(await (await alice.request('/me/addresses')).json())
          .data[0];
        assert.deepEqual(
          addressesSchema.parse(await (await bob.request('/me/addresses')).json()).data,
          [],
        );
        assert.equal(
          (
            await bob.request(`/me/addresses/${target.id}`, 'PATCH', {
              ...addressInput,
              version: target.version,
            })
          ).status,
          404,
        );
        assert.equal(
          (await bob.request(`/me/addresses/${target.id}`, 'DELETE', { version: target.version }))
            .status,
          404,
        );
        assert.equal(
          (await bob.request('/me/addresses', 'POST', { ...addressInput, userId: aliceId })).status,
          400,
        );
        assert.equal(
          (await alice.request('/me/addresses', 'POST', { ...addressInput, postalCode: 'bad' }))
            .status,
          400,
        );
        assert.equal(
          (await alice.request('/me/addresses', 'POST', { ...addressInput, countryCode: 'US' }))
            .status,
          400,
        );
      },
    );
    await check(
      'concurrent default changes have one winner and a stale edit cannot clear defaults',
      async () => {
        const fresh = (await (await bob.request('/me/addresses', 'POST', addressInput)).json())
          .data;
        const changes = await Promise.all([
          bob.request(`/me/addresses/${fresh.id}`, 'PATCH', {
            ...addressInput,
            city: 'First',
            isDefault: true,
            version: 0,
          }),
          bob.request(`/me/addresses/${fresh.id}`, 'PATCH', {
            ...addressInput,
            city: 'Second',
            isDefault: true,
            version: 0,
          }),
        ]);
        assert.deepEqual(changes.map((r) => r.status).sort(), [200, 409]);
        assert.equal(
          addressesSchema
            .parse(await (await bob.request('/me/addresses')).json())
            .data.filter((a) => a.isDefault).length,
          1,
        );
      },
    );
    await check('address cap is enforced under concurrent insert attempts', async () => {
      await db.prepare('DELETE FROM addresses WHERE user_id=?').bind(bobId).run();
      const attempts = await Promise.all(
        Array.from({ length: 12 }, (_, i) =>
          bob.request('/me/addresses', 'POST', {
            ...addressInput,
            recipient: `Address ${i}`,
            isDefault: true,
          }),
        ),
      );
      assert.equal(attempts.filter((r) => r.status === 201).length, 10);
      assert.equal(attempts.filter((r) => r.status === 409).length, 2);
      const list = addressesSchema.parse(await (await bob.request('/me/addresses')).json()).data;
      assert.equal(list.length, 10);
      assert.equal(list.filter((a) => a.isDefault).length, 1);
    });
    await check('absolute expiry and idle expiry deny old tokens and clear cookies', async () => {
      const visitor = client();
      await visitor.login('alice@example.test');
      const hash = await sha256(cookieValue(visitor.cookie, 'cc_session'));
      await db
        .prepare('UPDATE sessions SET created_at=?,expires_at=? WHERE token_hash=?')
        .bind(1, 2, hash)
        .run();
      assert.equal((await visitor.request('/me')).status, 401);
      assert.equal(visitor.jar.has('cc_session'), false);
      await visitor.login('alice@example.test');
      await db
        .prepare('UPDATE sessions SET last_seen_at=0 WHERE token_hash=?')
        .bind(await sha256(cookieValue(visitor.cookie, 'cc_session')))
        .run();
      assert.equal((await visitor.request('/me')).status, 401);
    });
    await check(
      'shared account rate limit blocks another client and emits Retry-After without raw identifiers',
      async () => {
        const visitor = client();
        for (let i = 0; i < 8; i++)
          assert.equal((await visitor.login('missing-rate@example.test', 'wrong')).status, 401);
        const other = client();
        const response = await other.login('missing-rate@example.test', 'wrong');
        assert.equal(response.status, 429);
        assert.ok(Number(response.headers.get('retry-after')) > 0);
        const keys = (await db.prepare('SELECT key FROM auth_rate_limits').all()).results;
        assert.ok(keys.every((r) => /^[0-9a-f]{64}$/.test(r.key)));
        await db.prepare('UPDATE auth_rate_limits SET expires_at=0').run();
        assert.equal((await other.login('missing-rate@example.test', 'wrong')).status, 401);
      },
    );
    await check(
      'sessions are bounded to five devices and logout revokes the current device',
      async () => {
        await db.prepare('DELETE FROM sessions WHERE user_id=?').bind(aliceId).run();
        const devices = [];
        for (let i = 0; i < 6; i++) {
          const visitor = client();
          assert.equal((await visitor.login('alice@example.test')).status, 200);
          devices.push(visitor);
        }
        assert.equal(
          (
            await db
              .prepare('SELECT COUNT(*) AS n FROM sessions WHERE user_id=?')
              .bind(aliceId)
              .first()
          ).n,
          5,
        );
        const current = devices.at(-1),
          cookie = current.cookie;
        assert.equal((await current.request('/auth/logout', 'POST')).status, 204);
        assert.equal((await app.request('/api/me', { headers: { cookie } }, env)).status, 401);
        assert.equal((await current.boot()).user, null);
      },
    );
    await check(
      'production cookies use __Host Secure and public auth fails closed without release verification',
      async () => {
        const closed = client(
          { ...env, APP_ENV: 'production', APP_ORIGIN: 'https://commerce.test' },
          'https://commerce.test',
        );
        assert.equal((await closed.request('/auth/session')).status, 503);
        const secure = client(
          {
            ...env,
            APP_ENV: 'production',
            APP_ORIGIN: 'https://commerce.test',
            AUTH_PUBLIC_ENABLED: 'verified',
            AUTH_PROVIDER: 'supabase',
            SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co',
            SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
          },
          'https://commerce.test',
        );
        const response = await secure.request('/auth/session');
        assert.equal(response.status, 200);
        assert.match(response.headers.get('set-cookie'), /__Host-cc_preauth=/);
        assert.match(response.headers.get('set-cookie'), /Secure/);
        assert.doesNotMatch(response.headers.get('set-cookie'), /Domain=/);
        const unsupported = client(
          {
            ...env,
            APP_ENV: 'production',
            APP_ORIGIN: 'https://commerce.test',
            AUTH_PUBLIC_ENABLED: 'verified',
          },
          'https://commerce.test',
        );
        assert.equal((await unsupported.request('/auth/session')).status, 503);
        const missingSecret = client({ ...env, AUTH_SECRET: undefined });
        assert.equal((await missingSecret.request('/auth/session')).status, 503);
      },
    );
    await check('registration rate limits share counters between clients', async () => {
      for (let i = 0; i < 3; i++)
        assert.equal((await client().register('alice@example.test')).status, 409);
      const response = await client().register('alice@example.test');
      assert.equal(response.status, 429);
      assert.ok(Number(response.headers.get('retry-after')) > 0);
    });
    await check(
      'IP denial cannot create new per-account buckets even with spoofed forwarding headers',
      async () => {
        const key = await hmac(env.AUTH_SECRET, 'login:ip:local'),
          time = Math.floor(Date.now() / 1000);
        await db
          .prepare('INSERT INTO auth_rate_limits VALUES (?,?,?,?)')
          .bind(key, time, 40, time + 600)
          .run();
        const visitor = client();
        const response = await visitor.login('new-rate-key@example.test');
        assert.equal(response.status, 429);
        assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM auth_rate_limits').first()).n, 1);
        await visitor.boot();
        assert.equal(
          (
            await visitor.request(
              '/auth/login',
              'POST',
              { email: 'other-key@example.test', password },
              { 'cf-connecting-ip': '8.8.8.8' },
            )
          ).status,
          429,
        );
        assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM auth_rate_limits').first()).n, 1);
      },
    );
    await check(
      'registration and session creation roll back together on an injected database failure',
      async () => {
        await db
          .prepare(
            "CREATE TRIGGER fail_session BEFORE INSERT ON sessions BEGIN SELECT RAISE(ABORT,'test-only session failure'); END",
          )
          .run();
        try {
          const response = await client().register('rollback@example.test');
          assert.equal(response.status, 500);
          assert.doesNotMatch(await response.text(), /test-only session failure/);
          assert.equal(
            (
              await db
                .prepare("SELECT COUNT(*) AS n FROM users WHERE email='rollback@example.test'")
                .first()
            ).n,
            0,
          );
        } finally {
          await db.prepare('DROP TRIGGER fail_session').run();
        }
      },
    );
    await check('development auth cannot accidentally run on a public deployment URL', async () => {
      const visitor = client(env, 'https://accidental-public.workers.dev');
      assert.equal((await visitor.request('/auth/session')).status, 503);
      assert.equal(
        (
          await visitor.request('/auth/register', 'POST', {
            name: 'No public user',
            email: 'public@example.test',
            password,
          })
        ).status,
        503,
      );
    });
    await check('rotating the auth secret invalidates existing session CSRF bindings', async () => {
      const visitor = client();
      assert.equal((await visitor.login('alice@example.test')).status, 200);
      const response = await app.request(
        '/api/me',
        { headers: { cookie: visitor.cookie } },
        { ...env, AUTH_SECRET: randomBytes(32).toString('hex') },
      );
      assert.equal(response.status, 401);
    });
    await check(
      'database constraints and foreign keys remain valid after account mutations',
      async () => {
        assert.deepEqual((await db.prepare('PRAGMA foreign_key_check').all()).results, []);
      },
    );
  } finally {
    await mf.dispose();
  }
});
