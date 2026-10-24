import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { Miniflare } from 'miniflare';
import { Hono } from 'hono';
import { app } from '../worker/app.ts';
import { security } from '../worker/middleware/security.ts';
import { requireAuth, protectMutation } from '../worker/middleware/auth.ts';
import { mutationLimit, mutationPolicies } from '../worker/middleware/rate-limit.ts';
import { sha256, hmac } from '../worker/services/crypto.ts';
import { applySQL } from './helpers/sql.mjs';
import { adminProductsResponseSchema, analyticsResponseSchema } from '../shared/admin.ts';

test('security headers and errors do not trust request IDs or leak sensitive context', async () => {
  for (const path of ['/health', '/missing']) {
    const response = await app.request(`https://store.test/api${path}`, {
      headers: { 'x-request-id': 'injected-untrusted-id', origin: 'https://evil.test' },
    });
    const body = await response.json();
    assert.notEqual(body.requestId, 'injected-untrusted-id');
    assert.equal(response.headers.get('x-request-id'), body.requestId);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('x-frame-options'), 'DENY');
    assert.equal(response.headers.get('cross-origin-resource-policy'), 'same-origin');
    assert.match(response.headers.get('strict-transport-security'), /max-age=31536000/);
    assert.match(response.headers.get('permissions-policy'), /camera=\(\)/);
    assert.equal(response.headers.get('access-control-allow-origin'), null);
  }
  const local = await app.request('http://localhost/api/health');
  assert.equal(local.headers.get('strict-transport-security'), null);
});
test('static asset policy disallows inline scripts/plugins and caches only versioned bundles immutably', () => {
  const headers = readFileSync('public/_headers', 'utf8');
  assert.match(headers, /script-src 'self'; script-src-attr 'none'/);
  assert.match(headers, /object-src 'none'/);
  assert.match(headers, /form-action 'self'/);
  assert.match(headers, /\/assets\/\*\s+Cache-Control: public, max-age=31536000, immutable/);
  assert.doesNotMatch(headers, /unsafe-inline|unsafe-eval|Access-Control-Allow-Origin/);
});
test('hardening on real D1: bounded shared mutation budgets, safe failures, admin discovery and indexes', async (suite) => {
  const config = JSON.parse(readFileSync('wrangler.jsonc', 'utf8'));
  const mf = new Miniflare({
    modules: true,
    script: 'export default {fetch(){return new Response("test")}}',
    compatibilityDate: config.compatibility_date,
    d1Databases: ['DB'],
  });
  try {
    const db = await mf.getD1Database('DB');
    for (const file of readdirSync('db/migrations')
      .filter((f) => f.endsWith('.sql'))
      .sort())
      await applySQL(db, `db/migrations/${file}`);
    await applySQL(db, 'db/seed/catalog.sql');
    await applySQL(db, 'db/seed/storefront.sql');
    const env = {
      DB: db,
      APP_ENV: 'development',
      PAYMENT_MODE: 'demo',
      AUTH_SECRET: randomBytes(32).toString('hex'),
    };
    let index = 0;
    async function client(role = 'customer') {
      const id = `hardening-${++index}`,
        token = randomBytes(32).toString('hex'),
        hash = await sha256(token),
        csrf = await hmac(env.AUTH_SECRET, `session-csrf:v1:${hash}`),
        time = Math.floor(Date.now() / 1000);
      await db
        .prepare('INSERT INTO users(id,email,name,password_hash,role) VALUES(?,?,?,?,?)')
        .bind(id, `${id}@example.test`, 'QA Customer', 'test-only', role)
        .run();
      await db
        .prepare(
          'INSERT INTO sessions(token_hash,user_id,csrf_token_hash,expires_at,created_at,last_seen_at) VALUES(?,?,?,?,?,?)',
        )
        .bind(hash, id, await sha256(csrf), time + 86400, time, time)
        .run();
      return {
        id,
        async request(path, method = 'GET', body, headers = {}, target = app, binding = env) {
          return target.request(
            `http://localhost/api${path}`,
            {
              method,
              headers: {
                cookie: `cc_session=${token}`,
                origin: 'http://localhost',
                'x-csrf-token': csrf,
                ...(body === undefined ? {} : { 'content-type': 'application/json' }),
                ...headers,
              },
              body: body === undefined ? undefined : JSON.stringify(body),
            },
            binding,
          );
        },
        async bucket(scope, attempts, expired = false) {
          const key = await hmac(env.AUTH_SECRET, `mutation:v1:${scope}:${id}`),
            time = Math.floor(Date.now() / 1000);
          await db
            .prepare(
              'INSERT INTO auth_rate_limits(key,window_start,attempts,expires_at) VALUES(?,?,?,?) ON CONFLICT(key) DO UPDATE SET attempts=excluded.attempts,expires_at=excluded.expires_at',
            )
            .bind(key, time - 5, attempts, time + (expired ? -1 : 50))
            .run();
          return key;
        },
      };
    }
    await suite.test(
      'checkout, quote, cancellation, account, shopping and admin mutations enforce server policies',
      async () => {
        for (const [scope, path, body] of [
          ['quote', '/checkout/quote', { addressId: 'missing', cartVersion: 0 }],
          ['checkout', '/checkout', { quoteId: crypto.randomUUID(), simulation: 'success' }],
          ['cancellation', '/orders/missing/cancel', { version: 0 }],
          ['account', '/me', { name: 'Name', version: 0 }],
          ['shopping', '/cart/items', { variantId: 'var-bag-natural', quantity: 1 }],
          [
            'administration',
            '/admin/categories',
            {
              slug: 'blocked',
              name: 'Blocked',
              description: '',
              image: '/images/photos/tote-main.webp',
            },
          ],
        ]) {
          const c = await client(scope === 'administration' ? 'admin' : 'customer');
          await c.bucket(scope, mutationPolicies[scope].limit);
          const response = await c.request(path, scope === 'account' ? 'PATCH' : 'POST', body, {
            'idempotency-key': crypto.randomUUID(),
          });
          assert.equal(response.status, 429, await response.clone().text());
          assert.ok(Number(response.headers.get('retry-after')) > 0);
          assert.equal((await response.json()).error.code, 'MUTATION_RATE_LIMIT');
        }
      },
    );
    await suite.test(
      'budgets are shared across app instances, expire, saturate and remain account scoped',
      async () => {
        const a = await client(),
          b = await client(),
          key = await a.bucket('shopping', 120);
        assert.equal(
          (await a.request('/cart/items', 'POST', { variantId: 'var-bag-natural', quantity: 1 }))
            .status,
          429,
        );
        assert.equal(
          (await b.request('/cart/items', 'POST', { variantId: 'var-bag-natural', quantity: 1 }))
            .status,
          200,
        );
        for (let i = 0; i < 3; i++)
          assert.equal(
            (await a.request('/cart/items', 'POST', { variantId: 'var-bag-natural', quantity: 1 }))
              .status,
            429,
          );
        assert.equal(
          (await db.prepare('SELECT attempts FROM auth_rate_limits WHERE key=?').bind(key).first())
            .attempts,
          121,
        );
        await a.bucket('shopping', 121, true);
        assert.equal(
          (await a.request('/cart/items', 'POST', { variantId: 'var-bag-natural', quantity: 1 }))
            .status,
          200,
        );
        assert.equal(
          (await db.prepare('SELECT attempts FROM auth_rate_limits WHERE key=?').bind(key).first())
            .attempts,
          1,
        );
      },
    );
    await suite.test(
      'concurrent near-limit requests admit exactly one mutation and do not overshoot cart',
      async () => {
        const c = await client();
        await c.bucket('shopping', 119);
        const responses = await Promise.all(
          Array.from({ length: 5 }, () =>
            c.request('/cart/items', 'POST', { variantId: 'var-bag-natural', quantity: 1 }),
          ),
        );
        assert.deepEqual(responses.map((r) => r.status).sort(), [200, 429, 429, 429, 429]);
        const cart = (await (await c.request('/cart')).json()).data;
        assert.equal(cart.itemCount, 1);
      },
    );
    await suite.test(
      'anonymous/CSRF/role failures do not allocate or consume mutation buckets; reads still work',
      async () => {
        const c = await client(),
          before = (await db.prepare('SELECT count(*) AS n FROM auth_rate_limits').first()).n;
        assert.equal(
          (await c.request('/cart/items', 'POST', {}, { 'x-csrf-token': 'bad' })).status,
          403,
        );
        assert.equal((await c.request('/admin/categories', 'POST', {})).status, 403);
        assert.equal(
          (await app.request('http://localhost/api/cart/items', { method: 'POST' }, env)).status,
          401,
        );
        assert.equal(
          (await db.prepare('SELECT count(*) AS n FROM auth_rate_limits').first()).n,
          before,
        );
        await c.bucket('shopping', 121);
        assert.equal((await c.request('/cart')).status, 200);
        assert.equal((await c.request('/wishlist')).status, 200);
      },
    );
    await suite.test(
      'budget DB failure fails closed without business side effects or internal errors',
      async () => {
        const c = await client();
        await db
          .prepare(
            "CREATE TRIGGER fail_budget BEFORE INSERT ON auth_rate_limits BEGIN SELECT RAISE(ABORT,'sensitive database internals'); END",
          )
          .run();
        try {
          const response = await c.request('/cart/items', 'POST', {
            variantId: 'var-bag-natural',
            quantity: 1,
          });
          assert.equal(response.status, 503);
          assert.doesNotMatch(await response.text(), /sensitive|SQLITE|INSERT/);
          assert.equal((await (await c.request('/cart')).json()).data.itemCount, 0);
        } finally {
          await db.prepare('DROP TRIGGER fail_budget').run();
        }
      },
    );
    await suite.test(
      'each request cleans at most twenty expired anonymous hash buckets',
      async () => {
        await db.batch(
          Array.from({ length: 25 }, (_, i) =>
            db
              .prepare(
                'INSERT INTO auth_rate_limits(key,window_start,attempts,expires_at) VALUES(?,1,1,2)',
              )
              .bind(i.toString(16).padStart(64, 'a')),
          ),
        );
        const c = await client();
        await c.request('/cart/items', 'POST', { variantId: 'var-bag-natural', quantity: 1 });
        assert.equal(
          (
            await db
              .prepare('SELECT count(*) AS n FROM auth_rate_limits WHERE expires_at=2')
              .first()
          ).n,
          5,
        );
      },
    );
    await suite.test(
      'streaming malformed/oversized JSON and spoofed identifiers never bypass validation',
      async () => {
        const c = await client('admin');
        const response = await c.request('/admin/categories', 'POST', {
          slug: 'x',
          name: '🙂'.repeat(9000),
          description: '',
          image: '/images/photos/tote-main.webp',
        });
        assert.equal(response.status, 413);
        assert.equal((await c.request('/admin/products?q=%27%20OR%201%3D1--')).status, 200);
        for (const path of [
          '/admin/products?archived=no',
          '/admin/products?stock=none',
          '/admin/products?q=' + 'a'.repeat(101),
          '/admin/products?q=a&q=b',
        ])
          assert.equal((await c.request(path)).status, 400);
      },
    );
    await suite.test(
      'admin search by SKU, category, archive and low-stock filters compose without injection',
      async () => {
        const c = await client('admin');
        async function list(query) {
          const response = await c.request(`/admin/products?${query}`);
          assert.equal(response.status, 200, await response.clone().text());
          return adminProductsResponseSchema.parse(await response.json());
        }
        assert.equal(
          (await list('q=TOTE-NAT&category=cat-everyday&archived=active')).data[0].id,
          'prod-bag',
        );
        assert.equal((await list('q=TOTE-NAT&category=cat-home')).meta.total, 0);
        assert.ok((await list('stock=low')).data.some((p) => p.id === 'prod-cup'));
        await db.prepare("UPDATE products SET archived=1 WHERE id='prod-bag'").run();
        try {
          assert.equal((await list('q=TOTE-NAT&archived=active')).meta.total, 0);
          assert.equal((await list('q=TOTE-NAT&archived=archived')).data[0].id, 'prod-bag');
        } finally {
          await db.prepare("UPDATE products SET archived=0 WHERE id='prod-bag'").run();
        }
        assert.equal((await list('q=%25%27%20OR%201%3D1--')).meta.total, 0);
      },
    );
    await suite.test(
      'analytics includes all status counts, sold units and bounded recent-order snapshots',
      async () => {
        const c = await client('admin'),
          response = await c.request('/admin/analytics?days=7'),
          data = analyticsResponseSchema.parse(await response.json()).data;
        assert.equal(
          data.ordersByStatus.reduce((n, r) => n + r.count, 0),
          data.orders,
        );
        assert.equal(data.productsSold, 0);
        assert.deepEqual(data.recentOrders, []);
      },
    );
    await suite.test(
      'ignored address default insert or target edit cannot clear an existing default',
      async () => {
        const c = await client(),
          base = {
            recipient: 'Sample Person',
            line1: '12 Sample Lane',
            line2: '',
            city: 'Demo City',
            region: 'Demo State',
            postalCode: '110001',
            countryCode: 'IN',
            phone: '5551234567',
            isDefault: true,
          };
        const firstResponse = await c.request('/me/addresses', 'POST', base);
        assert.equal(firstResponse.status, 201);
        const first = (await firstResponse.json()).data;
        const secondResponse = await c.request('/me/addresses', 'POST', {
          ...base,
          isDefault: false,
        });
        assert.equal(secondResponse.status, 201);
        const second = (await secondResponse.json()).data;
        await db
          .prepare(
            `CREATE TRIGGER skip_address_target BEFORE UPDATE ON addresses WHEN OLD.id='${second.id}' BEGIN SELECT RAISE(IGNORE); END`,
          )
          .run();
        try {
          assert.equal(
            (
              await c.request(`/me/addresses/${second.id}`, 'PATCH', {
                ...base,
                version: second.version,
              })
            ).status,
            409,
          );
          assert.equal(
            (await db.prepare('SELECT is_default FROM addresses WHERE id=?').bind(first.id).first())
              .is_default,
            1,
          );
        } finally {
          await db.prepare('DROP TRIGGER skip_address_target').run();
        }
        const before = (
          await db.prepare('SELECT count(*) AS n FROM addresses WHERE user_id=?').bind(c.id).first()
        ).n;
        await db
          .prepare(
            'CREATE TRIGGER skip_address_default BEFORE UPDATE OF is_default ON addresses WHEN OLD.is_default=0 AND NEW.is_default=1 BEGIN SELECT RAISE(IGNORE); END',
          )
          .run();
        try {
          assert.equal((await c.request('/me/addresses', 'POST', base)).status, 409);
          assert.equal(
            (
              await db
                .prepare('SELECT count(*) AS n FROM addresses WHERE user_id=?')
                .bind(c.id)
                .first()
            ).n,
            before,
          );
          assert.equal(
            (await db.prepare('SELECT is_default FROM addresses WHERE id=?').bind(first.id).first())
              .is_default,
            1,
          );
        } finally {
          await db.prepare('DROP TRIGGER skip_address_default').run();
        }
      },
    );
    await suite.test(
      'stable owner/status pagination and idle cleanup have explicit supporting indexes',
      async () => {
        for (const [sql, index] of [
          [
            "SELECT id FROM orders WHERE user_id='x' ORDER BY created_at DESC,id DESC LIMIT 10",
            'orders_user_page',
          ],
          [
            "SELECT id FROM orders WHERE status='CONFIRMED' ORDER BY created_at DESC,id DESC LIMIT 20",
            'orders_status_page',
          ],
          ['SELECT token_hash FROM sessions WHERE last_seen_at<1 LIMIT 20', 'sessions_idle'],
          [
            "SELECT id FROM product_variants WHERE product_id='prod-bag' AND active=1 AND stock>0",
            'variants_product_stock',
          ],
        ]) {
          const plan = (await db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all()).results
            .map((r) => r.detail)
            .join(' ');
          assert.match(plan, new RegExp(index));
          assert.doesNotMatch(plan, /USE TEMP B-TREE/);
        }
      },
    );
    await suite.test(
      'rate policy survives independent Hono application instances using the same database',
      async () => {
        function instance() {
          const service = new Hono();
          service.onError((error, c) =>
            c.json({ error: { message: error.message } }, error.status ?? 500),
          );
          service.use(
            '/api/*',
            security,
            requireAuth,
            protectMutation,
            mutationLimit('cancellation'),
          );
          service.post('/api/test', (c) => c.json({ ok: true }));
          return service;
        }
        const c = await client();
        await c.bucket('cancellation', 11);
        assert.equal((await c.request('/test', 'POST', {}, {}, instance())).status, 200);
        assert.equal((await c.request('/test', 'POST', {}, {}, instance())).status, 429);
      },
    );
  } finally {
    await mf.dispose();
  }
});
