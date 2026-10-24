import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Miniflare } from 'miniflare';
import { app } from '../backend/src/app.ts';
import { sha256, hmac, hashPassword } from '../backend/src/services/crypto.ts';
import { wishlistResponseSchema, wishlistMoveResponseSchema } from '../shared/wishlist.ts';
import { cartResponseSchema } from '../shared/cart.ts';
import { safeReturnPath } from '../shared/return-path.ts';
import { applySQL } from './helpers/sql.mjs';

test('wishlist is an allowed local login return destination', () =>
  assert.equal(safeReturnPath('/wishlist?next=https://evil.test'), '/wishlist'));
test('wishlist ownership, persistence and atomic cart transfer on real D1', async (suite) => {
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
      '0005_checkout.sql',
      '0006_administration.sql',
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
        .prepare('INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,?)')
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
        async request(path, method = 'GET', body, headers = {}) {
          return app.request(
            `http://localhost/api${path}`,
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
        async wishlist() {
          const r = await this.request('/wishlist');
          assert.equal(r.status, 200, await r.clone().text());
          return wishlistResponseSchema.parse(await r.json()).data;
        },
        async cart() {
          const r = await this.request('/cart');
          assert.equal(r.status, 200);
          return cartResponseSchema.parse(await r.json()).data;
        },
      };
    }
    const alice = await client('wish-alice'),
      bob = await client('wish-bob');
    const product = await db
      .prepare(
        'SELECT p.id,p.slug,v.id AS variantId,v.stock FROM products p JOIN product_variants v ON v.product_id=p.id WHERE p.archived=0 AND v.active=1 AND v.stock>=20 LIMIT 1',
      )
      .first();
    const other = await db
      .prepare(
        'SELECT p.id,v.id AS variantId FROM products p JOIN product_variants v ON v.product_id=p.id WHERE p.id!=? AND p.archived=0 AND v.active=1 AND v.stock>0 LIMIT 1',
      )
      .bind(product.id)
      .first();
    const item = `/wishlist/items/${product.id}`,
      run = (name, fn) => suite.test(name, fn);
    await run('anonymous clients cannot list, save, remove or move favorites', async () => {
      for (const [path, method] of [
        ['/wishlist', 'GET'],
        [item, 'PUT'],
        [item, 'DELETE'],
        [`${item}/move`, 'POST'],
      ])
        assert.equal(
          (await app.request(`http://localhost/api${path}`, { method }, env)).status,
          401,
        );
    });
    await run('empty reads do not create wishlists', async () => {
      assert.deepEqual(await alice.wishlist(), []);
      assert.equal((await db.prepare('SELECT count(*) n FROM wishlists').first()).n, 0);
    });
    await run('all mutation methods enforce CSRF and exact origin', async () => {
      for (const [method, path, body] of [
        ['PUT', item, {}],
        ['DELETE', item, {}],
        ['POST', `${item}/move`, { variantId: product.variantId, quantity: 1 }],
      ]) {
        assert.equal(
          (await alice.request(path, method, body, { 'x-csrf-token': 'wrong' })).status,
          403,
        );
        assert.equal(
          (await alice.request(path, method, body, { origin: 'https://evil.test' })).status,
          403,
        );
      }
    });
    await run(
      'strict inputs reject owner/price injection, malformed IDs and invalid quantities',
      async () => {
        for (const body of [{ userId: 'wish-bob' }, { priceMinor: 1 }])
          assert.equal((await alice.request(item, 'PUT', body)).status, 400);
        assert.equal((await alice.request('/wishlist/items/bad%27id', 'PUT', {})).status, 400);
        for (const quantity of [0, 21, 1.5, '1'])
          assert.equal(
            (
              await alice.request(`${item}/move`, 'POST', {
                variantId: product.variantId,
                quantity,
              })
            ).status,
            400,
          );
        assert.equal(
          (
            await alice.request(`${item}/move`, 'POST', {
              variantId: product.variantId,
              quantity: 1,
              priceMinor: 1,
            })
          ).status,
          400,
        );
        assert.equal((await alice.request('/wishlist/items/missing', 'PUT', {})).status, 409);
      },
    );
    await run(
      'save is idempotent, persists live variants/images and is scoped to the owner',
      async () => {
        for (let i = 0; i < 2; i++)
          assert.equal((await alice.request(item, 'PUT', {})).status, 200);
        const list = await alice.wishlist();
        assert.equal(list.length, 1);
        assert.equal(list[0].productId, product.id);
        assert.equal(list[0].available, true);
        assert.ok(list[0].variants.length > 0);
        assert.deepEqual(await bob.wishlist(), []);
        assert.equal((await bob.request(item, 'DELETE', {})).status, 200);
        assert.equal((await alice.wishlist()).length, 1);
      },
    );
    await run(
      'variants from other products and non-owned favorites cannot be transferred',
      async () => {
        assert.equal(
          (await alice.request(`${item}/move`, 'POST', { variantId: other.variantId, quantity: 1 }))
            .status,
          409,
        );
        assert.equal(
          (await bob.request(`${item}/move`, 'POST', { variantId: product.variantId, quantity: 1 }))
            .status,
          409,
        );
        assert.equal((await alice.wishlist()).length, 1);
        assert.equal((await alice.cart()).itemCount, 0);
        assert.equal((await bob.cart()).itemCount, 0);
      },
    );
    await run('stock failure retains the favorite, even when creating a new cart', async () => {
      await db
        .prepare('UPDATE product_variants SET stock=0 WHERE id=?')
        .bind(product.variantId)
        .run();
      assert.equal(
        (await alice.request(`${item}/move`, 'POST', { variantId: product.variantId, quantity: 1 }))
          .status,
        409,
      );
      assert.equal((await alice.wishlist()).length, 1);
      assert.equal((await alice.cart()).itemCount, 0);
      await db
        .prepare('UPDATE product_variants SET stock=? WHERE id=?')
        .bind(product.stock, product.variantId)
        .run();
    });
    await run(
      'chosen variant and quantity move atomically without reserving inventory',
      async () => {
        const response = await alice.request(`${item}/move`, 'POST', {
          variantId: product.variantId,
          quantity: 2,
        });
        assert.equal(response.status, 200, await response.clone().text());
        const result = wishlistMoveResponseSchema.parse(await response.json()).data;
        assert.equal(result.wishlist.length, 0);
        assert.equal(result.cart.itemCount, 2);
        assert.equal(result.cart.items[0].variantId, product.variantId);
        assert.equal(result.cart.version, 1);
        assert.equal(
          (
            await db
              .prepare('SELECT stock FROM product_variants WHERE id=?')
              .bind(product.variantId)
              .first()
          ).stock,
          product.stock,
        );
        assert.equal(
          (
            await alice.request(`${item}/move`, 'POST', {
              variantId: product.variantId,
              quantity: 2,
            })
          ).status,
          409,
        );
        assert.equal((await alice.cart()).itemCount, 2);
      },
    );
    await run('concurrent duplicate move requests add exactly once', async () => {
      await alice.request(item, 'PUT', {});
      const results = await Promise.all(
        [1, 2].map(() =>
          alice.request(`${item}/move`, 'POST', { variantId: product.variantId, quantity: 1 }),
        ),
      );
      assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
      assert.equal((await alice.cart()).itemCount, 3);
      assert.equal((await alice.wishlist()).length, 0);
    });
    await run('injected favorite-delete failure rolls back cart quantity and version', async () => {
      await alice.request(item, 'PUT', {});
      const before = await alice.cart();
      await db
        .prepare(
          "CREATE TRIGGER reject_wishlist_delete BEFORE DELETE ON wishlist_items BEGIN SELECT RAISE(ABORT,'test failure'); END",
        )
        .run();
      const response = await alice.request(`${item}/move`, 'POST', {
        variantId: product.variantId,
        quantity: 1,
      });
      assert.equal(response.status, 500);
      assert.doesNotMatch(await response.text(), /test failure|SQLITE/);
      assert.deepEqual(await alice.cart(), before);
      assert.equal((await alice.wishlist()).length, 1);
      await db.prepare('DROP TRIGGER reject_wishlist_delete').run();
    });
    await run('inactive/archived saved products remain removable and cannot move', async () => {
      await db
        .prepare('UPDATE product_variants SET active=0 WHERE product_id=?')
        .bind(product.id)
        .run();
      assert.equal((await alice.wishlist())[0].available, false);
      assert.equal(
        (await alice.request(`${item}/move`, 'POST', { variantId: product.variantId, quantity: 1 }))
          .status,
        409,
      );
      await db
        .prepare('UPDATE product_variants SET active=1 WHERE product_id=?')
        .bind(product.id)
        .run();
      await db.prepare('UPDATE products SET archived=1 WHERE id=?').bind(product.id).run();
      assert.equal((await alice.wishlist())[0].available, false);
      assert.equal((await alice.wishlist())[0].variants.length, 0);
      assert.equal((await alice.request(item, 'PUT', {})).status, 409);
      assert.equal((await alice.request(item, 'DELETE', {})).status, 200);
      assert.equal((await alice.wishlist()).length, 0);
      await db.prepare('UPDATE products SET archived=0 WHERE id=?').bind(product.id).run();
    });
    await run('cumulative cart quantity failure keeps the wishlist entry', async () => {
      await alice.request(item, 'PUT', {});
      assert.equal(
        (
          await alice.request(`${item}/move`, 'POST', {
            variantId: product.variantId,
            quantity: 20,
          })
        ).status,
        409,
      );
      assert.equal((await alice.wishlist()).length, 1);
      assert.equal((await alice.cart()).itemCount, 3);
    });
    await run(
      'wishlist limit is enforced under concurrent saves; existing saves remain idempotent',
      async () => {
        await db.prepare("INSERT INTO wishlists(id,user_id) VALUES('cap-list','wish-bob')").run();
        const statements = [];
        for (let i = 0; i < 48; i++) {
          statements.push(
            db
              .prepare(
                'INSERT INTO products(id,category_id,slug,name,description) SELECT ?,category_id,?,?,? FROM products WHERE id=?',
              )
              .bind(`cap-${i}`, `cap-${i}`, `Cap ${i}`, 'Test only', product.id),
          );
          statements.push(
            db
              .prepare("INSERT INTO wishlist_items(wishlist_id,product_id) VALUES('cap-list',?)")
              .bind(`cap-${i}`),
          );
        }
        await db.batch(statements);
        await bob.request(item, 'PUT', {});
        const third = await db
          .prepare(
            'SELECT id FROM products WHERE id NOT IN (?,?) AND id NOT LIKE ? AND archived=0 LIMIT 1',
          )
          .bind(product.id, other.id, 'cap-%')
          .first();
        const responses = await Promise.all(
          [other.id, third.id].map((id) => bob.request(`/wishlist/items/${id}`, 'PUT', {})),
        );
        assert.deepEqual(responses.map((r) => r.status).sort(), [200, 409]);
        assert.equal((await bob.wishlist()).length, 50);
        assert.equal((await bob.request(item, 'PUT', {})).status, 200);
      },
    );
    await run('readiness requires cart-version triggers as well as table columns', async () => {
      assert.equal((await app.request('http://localhost/api/ready', {}, env)).status, 200);
      const trigger = await db
        .prepare("SELECT sql FROM sqlite_schema WHERE name='cart_item_insert'")
        .first();
      await db.prepare('DROP TRIGGER cart_item_insert').run();
      assert.equal((await app.request('http://localhost/api/ready', {}, env)).status, 503);
      await db.prepare(trigger.sql).run();
      assert.equal((await app.request('http://localhost/api/ready', {}, env)).status, 200);
    });
    await run('real logout/login restores the persisted wishlist', async () => {
      const before = await alice.wishlist(),
        password = 'Wishlist test passphrase 2026!';
      await db
        .prepare('UPDATE users SET password_hash=? WHERE id=?')
        .bind(await hashPassword(password), 'wish-alice')
        .run();
      assert.equal((await alice.request('/auth/logout', 'POST')).status, 204);
      assert.equal((await alice.request('/wishlist')).status, 401);
      const boot = await app.request('http://localhost/api/auth/session', {}, env),
        csrf = (await boot.json()).data.csrfToken,
        cookie = boot.headers
          .getSetCookie()
          .map((c) => c.split(';')[0])
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
          body: JSON.stringify({ email: 'wish-alice@example.test', password }),
        },
        env,
      );
      assert.equal(login.status, 200, await login.clone().text());
      const sessionCookie = login.headers
        .getSetCookie()
        .find((c) => c.startsWith('cc_session='))
        .split(';')[0];
      const restored = await app.request(
        'http://localhost/api/wishlist',
        { headers: { cookie: sessionCookie } },
        env,
      );
      assert.equal(restored.status, 200);
      assert.deepEqual(wishlistResponseSchema.parse(await restored.json()).data, before);
    });
  } finally {
    await mf.dispose();
  }
});
