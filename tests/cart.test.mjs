import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Miniflare } from 'miniflare';
import { app } from '../backend/src/app.ts';
import { sha256, hmac, hashPassword } from '../backend/src/services/crypto.ts';
import { readCart, writeCart } from '../backend/src/repositories/cart.ts';
import { cartResponseSchema } from '../shared/cart.ts';
import { safeReturnPath } from '../shared/return-path.ts';
import { applySQL } from './helpers/sql.mjs';

test('login return paths allow only known local destinations', () => {
  assert.equal(safeReturnPath('/cart'), '/cart');
  assert.equal(
    safeReturnPath('/products/daily-canvas-tote?variant=var-tote-sage'),
    '/products/daily-canvas-tote?variant=var-tote-sage',
  );
  for (const input of [
    null,
    '//evil.test/cart',
    'https://evil.test/cart',
    '/\\evil.test/cart',
    '/unknown',
    '/login',
    '/cart?next=https://evil.test',
  ])
    assert.equal(safeReturnPath(input), input?.startsWith('/cart?') ? '/cart' : '/account');
});

test('persistent owned cart on real D1', async (suite) => {
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
      '0004_cart_versions.sql',
    ])
      await applySQL(db, `backend/db/migrations/${file}`);
    await applySQL(db, 'backend/db/seed/catalog.sql');
    await applySQL(db, 'backend/db/seed/storefront.sql');
    const env = {
      DB: db,
      APP_ENV: 'development',
      PAYMENT_MODE: 'demo',
      AUTH_SECRET: randomBytes(32).toString('hex'),
    };
    async function client(id) {
      await db
        .prepare('INSERT INTO users (id,email,name,password_hash) VALUES (?,?,?,?)')
        .bind(id, `${id}@example.test`, id, 'test-only')
        .run();
      const token = randomBytes(32).toString('hex'),
        hash = await sha256(token),
        csrf = await hmac(env.AUTH_SECRET, `session-csrf:v1:${hash}`),
        time = Math.floor(Date.now() / 1000);
      await db
        .prepare(
          'INSERT INTO sessions(token_hash,user_id,csrf_token_hash,expires_at,created_at,last_seen_at) VALUES(?,?,?,?,?,?)',
        )
        .bind(hash, id, await sha256(csrf), time + 86400, time, time)
        .run();
      return {
        token,
        csrf,
        async request(path = '', method = 'GET', body, headers = {}) {
          return app.request(
            `http://localhost/api/cart${path}`,
            {
              method,
              headers: {
                cookie: `cc_session=${token}`,
                origin: 'http://localhost',
                'x-csrf-token': csrf,
                ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
                ...headers,
              },
              body: body === undefined ? undefined : JSON.stringify(body),
            },
            env,
          );
        },
        async cart() {
          const response = await this.request();
          assert.equal(response.status, 200);
          return cartResponseSchema.parse(await response.json()).data;
        },
      };
    }
    const alice = await client('alice-cart'),
      bob = await client('bob-cart');
    const variant = await db
      .prepare(
        'SELECT v.id, v.product_id, v.stock, v.price_minor FROM product_variants v JOIN products p ON p.id=v.product_id WHERE v.stock>=20 AND v.active=1 AND p.archived=0 LIMIT 1',
      )
      .first();
    let version;
    const run = (name, fn) => suite.test(name, fn);
    await run('anonymous cannot read or mutate carts', async () => {
      for (const method of ['GET', 'POST', 'PUT', 'DELETE']) {
        const response = await app.request(
          `http://localhost/api/cart${method === 'GET' ? '' : '/items'}`,
          { method },
          env,
        );
        assert.equal(response.status, 401);
      }
    });
    await run('empty cart is stable and does not create rows', async () => {
      assert.deepEqual(await alice.cart(), {
        version: 0,
        currency: 'INR',
        items: [],
        itemCount: 0,
        subtotalMinor: 0,
        hasIssues: false,
      });
      assert.equal((await db.prepare('SELECT count(*) n FROM carts').first()).n, 0);
    });
    await run('mutations reject bad CSRF, foreign origin and cross-site metadata', async () => {
      for (const headers of [
        { 'x-csrf-token': 'wrong' },
        { origin: 'https://evil.test' },
        { 'sec-fetch-site': 'cross-site' },
      ])
        assert.equal(
          (await alice.request('/items', 'POST', { variantId: variant.id, quantity: 1 }, headers))
            .status,
          403,
        );
    });
    await run('strict inputs reject client prices, owners and invalid quantities', async () => {
      for (const quantity of [0, 21, -1, 1.5, '2', null])
        assert.equal(
          (await alice.request('/items', 'POST', { variantId: variant.id, quantity })).status,
          400,
        );
      for (const extra of [{ priceMinor: 1 }, { userId: 'bob-cart' }, { version: 0 }])
        assert.equal(
          (await alice.request('/items', 'POST', { variantId: variant.id, quantity: 1, ...extra }))
            .status,
          400,
        );
    });
    await run('missing/injection variants and excess stock do not add items', async () => {
      for (const id of ['missing-variant', "x' OR 1=1--"])
        assert.ok(
          [400, 409].includes(
            (await alice.request('/items', 'POST', { variantId: id, quantity: 1 })).status,
          ),
        );
      const low = await db
        .prepare('SELECT id FROM product_variants WHERE stock<20 AND stock>0 LIMIT 1')
        .first();
      assert.equal(
        (await alice.request('/items', 'POST', { variantId: low.id, quantity: 20 })).status,
        409,
      );
      assert.equal((await alice.cart()).itemCount, 0);
    });
    await run(
      'add, cumulative add, totals and version are server derived; stock is unchanged',
      async () => {
        assert.equal(
          (await alice.request('/items', 'POST', { variantId: variant.id, quantity: 2 })).status,
          200,
        );
        assert.equal(
          (await alice.request('/items', 'POST', { variantId: variant.id, quantity: 1 })).status,
          200,
        );
        const cart = await alice.cart();
        version = cart.version;
        assert.equal(cart.itemCount, 3);
        assert.equal(cart.items.length, 1);
        assert.equal(cart.subtotalMinor, variant.price_minor * 3);
        assert.equal(version, 2);
        assert.equal(
          (
            await db
              .prepare('SELECT stock FROM product_variants WHERE id=?')
              .bind(variant.id)
              .first()
          ).stock,
          variant.stock,
        );
        assert.equal((await bob.cart()).itemCount, 0);
      },
    );
    await run('stale quantity and removal requests cannot overwrite a newer cart', async () => {
      assert.equal(
        (await alice.request(`/items/${variant.id}`, 'PUT', { quantity: 4, version: version - 1 }))
          .status,
        409,
      );
      assert.equal(
        (await alice.request(`/items/${variant.id}`, 'DELETE', { version: version - 1 })).status,
        409,
      );
      assert.equal((await alice.cart()).itemCount, 3);
      assert.equal(
        (await alice.request(`/items/${variant.id}`, 'PUT', { quantity: 4, version })).status,
        200,
      );
      version = (await alice.cart()).version;
      assert.equal(version, 3);
    });
    await run('other customers cannot remove another account’s line', async () => {
      assert.equal((await bob.request(`/items/${variant.id}`, 'DELETE', { version })).status, 409);
      assert.equal((await alice.cart()).itemCount, 4);
    });
    await run('concurrent additive requests enforce the cumulative 20 item limit', async () => {
      const responses = await Promise.all(
        Array.from({ length: 4 }, () =>
          alice.request('/items', 'POST', { variantId: variant.id, quantity: 5 }),
        ),
      );
      assert.equal(responses.filter((r) => r.status === 200).length, 3);
      assert.equal(responses.filter((r) => r.status === 409).length, 1);
      assert.equal((await alice.cart()).itemCount, 19);
    });
    await run(
      'current prices and shortage appear on reads; insufficient additions are blocked',
      async () => {
        await db
          .prepare('UPDATE product_variants SET price_minor=?,stock=2 WHERE id=?')
          .bind(variant.price_minor + 123, variant.id)
          .run();
        const cart = await alice.cart();
        assert.equal(cart.subtotalMinor, (variant.price_minor + 123) * 19);
        assert.equal(cart.items[0].issue, 'INSUFFICIENT_STOCK');
        assert.equal(cart.hasIssues, true);
        assert.equal(
          (await alice.request('/items', 'POST', { variantId: variant.id, quantity: 1 })).status,
          409,
        );
        assert.equal(
          (
            await alice.request(`/items/${variant.id}`, 'PUT', {
              quantity: 2,
              version: cart.version,
            })
          ).status,
          200,
        );
        assert.equal((await alice.cart()).hasIssues, false);
      },
    );
    await run(
      'inactive and archived items stay visible and removable but cannot be added',
      async () => {
        await db.prepare('UPDATE product_variants SET active=0 WHERE id=?').bind(variant.id).run();
        assert.equal((await alice.cart()).items[0].issue, 'UNAVAILABLE');
        assert.equal(
          (await alice.request('/items', 'POST', { variantId: variant.id, quantity: 1 })).status,
          409,
        );
        await db.prepare('UPDATE product_variants SET active=1 WHERE id=?').bind(variant.id).run();
        await db
          .prepare('UPDATE products SET archived=1 WHERE id=?')
          .bind(variant.product_id)
          .run();
        assert.equal((await alice.cart()).items[0].issue, 'UNAVAILABLE');
        const before = await alice.cart();
        assert.equal(
          (await alice.request(`/items/${variant.id}`, 'DELETE', { version: before.version }))
            .status,
          200,
        );
        const after = await alice.cart();
        assert.equal(after.itemCount, 0);
        assert.equal(after.version, before.version + 1);
        await db
          .prepare('UPDATE products SET archived=0 WHERE id=?')
          .bind(variant.product_id)
          .run();
        await db
          .prepare('UPDATE product_variants SET stock=?,price_minor=? WHERE id=?')
          .bind(variant.stock, variant.price_minor, variant.id)
          .run();
      },
    );
    await run('simultaneous versioned replacements produce one winner', async () => {
      await writeCart(db, 'alice-cart', variant.id, 1);
      const before = await alice.cart();
      const results = await Promise.all(
        [2, 3].map((quantity) =>
          alice.request(`/items/${variant.id}`, 'PUT', { quantity, version: before.version }),
        ),
      );
      assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
      assert.equal((await alice.cart()).version, before.version + 1);
    });
    await run('line count is capped atomically, while existing lines remain editable', async () => {
      await db.prepare("INSERT INTO carts(id,user_id) VALUES('bob-bag','bob-cart')").run();
      const inserts = [];
      for (let i = 0; i < 51; i++) {
        inserts.push(
          db
            .prepare(
              'INSERT INTO product_variants(id,product_id,sku,label,price_minor,stock,image_path,detail_image_path) VALUES(?,?,?,?,10,30,?,?)',
            )
            .bind(
              `limit-${i}`,
              variant.product_id,
              `LIMIT-${i}`,
              `Limit ${i}`,
              '/images/test.webp',
              '/images/test.webp',
            ),
        );
      }
      await db.batch(inserts);
      await db.batch(
        Array.from({ length: 50 }, (_, i) =>
          db
            .prepare("INSERT INTO cart_items(cart_id,variant_id,quantity) VALUES('bob-bag',?,1)")
            .bind(`limit-${i}`),
        ),
      );
      assert.equal(await writeCart(db, 'bob-cart', 'limit-50', 1), false);
      assert.equal(await writeCart(db, 'bob-cart', 'limit-0', 1), true);
      assert.equal((await bob.cart()).items.length, 50);
      assert.equal((await bob.cart()).itemCount, 51);
    });
    await run(
      'cart and version survive a fresh repository read, independent of session',
      async () => {
        assert.deepEqual(await readCart(db, 'alice-cart'), await alice.cart());
      },
    );
    await run('logout and real password login restore the same saved cart', async () => {
      const before = await alice.cart(),
        password = 'Cart test long passphrase 2026!';
      await db
        .prepare('UPDATE users SET password_hash=? WHERE id=?')
        .bind(await hashPassword(password), 'alice-cart')
        .run();
      const logout = await app.request(
        'http://localhost/api/auth/logout',
        {
          method: 'POST',
          headers: {
            cookie: `cc_session=${alice.token}`,
            origin: 'http://localhost',
            'x-csrf-token': alice.csrf,
          },
        },
        env,
      );
      assert.equal(logout.status, 204);
      assert.equal((await alice.request()).status, 401);
      const boot = await app.request('http://localhost/api/auth/session', {}, env);
      const csrf = (await boot.json()).data.csrfToken;
      const cookie = boot.headers
        .getSetCookie()
        .map((value) => value.split(';')[0])
        .join('; ');
      const login = await app.request(
        'http://localhost/api/auth/login',
        {
          method: 'POST',
          headers: {
            cookie,
            origin: 'http://localhost',
            'x-csrf-token': csrf,
            'content-type': 'application/json',
          },
          body: JSON.stringify({ email: 'alice-cart@example.test', password }),
        },
        env,
      );
      assert.equal(login.status, 200, await login.clone().text());
      const sessionCookie = login.headers
        .getSetCookie()
        .find((value) => value.startsWith('cc_session='))
        .split(';')[0];
      const restored = await app.request(
        'http://localhost/api/cart',
        { headers: { cookie: sessionCookie } },
        env,
      );
      assert.equal(restored.status, 200);
      assert.deepEqual(cartResponseSchema.parse(await restored.json()).data, before);
    });
    await run('failed item insert rolls back creation of its new cart', async () => {
      await client('rollback-cart');
      await db
        .prepare(
          "CREATE TRIGGER reject_cart_item BEFORE INSERT ON cart_items WHEN NEW.variant_id='limit-50' BEGIN SELECT RAISE(ABORT, 'test failure'); END",
        )
        .run();
      await assert.rejects(writeCart(db, 'rollback-cart', 'limit-50', 1));
      assert.equal(
        await db.prepare("SELECT id FROM carts WHERE user_id='rollback-cart'").first(),
        null,
      );
      await db.prepare('DROP TRIGGER reject_cart_item').run();
    });
  } finally {
    await mf.dispose();
  }
});
