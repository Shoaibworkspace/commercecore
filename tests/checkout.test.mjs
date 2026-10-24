import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Miniflare } from 'miniflare';
import { app } from '../worker/app.ts';
import { sha256, hmac } from '../worker/services/crypto.ts';
import {
  demoTotals,
  quoteResponseSchema,
  orderResponseSchema,
  orderListResponseSchema,
} from '../shared/checkout.ts';
import { applySQL } from './helpers/sql.mjs';

test('illustrative checkout totals use integer paise, exact free-shipping threshold and rounding', () => {
  assert.deepEqual(demoTotals(10000), {
    subtotalMinor: 10000,
    shippingMinor: 7900,
    taxMinor: 500,
    totalMinor: 18400,
  });
  assert.equal(demoTotals(249999).shippingMinor, 7900);
  assert.equal(demoTotals(250000).shippingMinor, 0);
  assert.equal(demoTotals(10).taxMinor, 1);
  assert.equal(demoTotals(1).taxMinor, 0);
});
test('real D1 checkout, atomic inventory, idempotency and owned orders', async (suite) => {
  const config = JSON.parse(readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8'));
  const mf = new Miniflare({
    modules: true,
    script: 'export default {fetch(){return new Response("test");}}',
    compatibilityDate: config.compatibility_date,
    d1Databases: ['DB'],
  });
  try {
    const db = await mf.getD1Database('DB');
    for (const f of [
      '0001_initial.sql',
      '0002_catalog.sql',
      '0009_catalog_sale_prices.sql',
      '0003_accounts.sql',
      '0004_cart_versions.sql',
      '0005_checkout.sql',
      '0006_administration.sql',
    ])
      await applySQL(db, `db/migrations/${f}`);
    await applySQL(db, 'db/seed/catalog.sql');
    await applySQL(db, 'db/seed/storefront.sql');
    const env = {
      DB: db,
      APP_ENV: 'development',
      PAYMENT_MODE: 'demo',
      AUTH_SECRET: randomBytes(32).toString('hex'),
    };
    const variants = ['var-lamp-sage', 'var-cup-sand'];
    let counter = 0;
    async function fixture(quantities = [1]) {
      const id = `checkout-${++counter}`,
        addressId = `address-${counter}`,
        cartId = `cart-${counter}`,
        time = Math.floor(Date.now() / 1000);
      await db.batch([
        db
          .prepare('INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,?)')
          .bind(id, `${id}@example.test`, 'Demo Customer', 'test-only'),
        db
          .prepare(
            "INSERT INTO addresses(id,user_id,recipient,line1,city,region,postal_code,phone) VALUES(?,?,'Demo Recipient','12 Sample Lane','Demo City','Demo State','110001','5551234567')",
          )
          .bind(addressId, id),
        db.prepare('INSERT INTO carts(id,user_id) VALUES(?,?)').bind(cartId, id),
        ...variants.map((v, i) =>
          db
            .prepare('UPDATE product_variants SET stock=20,price_minor=?,active=1 WHERE id=?')
            .bind((i + 1) * 10000, v),
        ),
        db
          .prepare(
            'UPDATE products SET archived=0 WHERE id IN(SELECT product_id FROM product_variants WHERE id IN(?,?))',
          )
          .bind(...variants),
        ...quantities.map((quantity, i) =>
          db
            .prepare('INSERT INTO cart_items(cart_id,variant_id,quantity) VALUES(?,?,?)')
            .bind(cartId, variants[i], quantity),
        ),
      ]);
      const token = randomBytes(32).toString('hex'),
        hash = await sha256(token),
        csrf = await hmac(env.AUTH_SECRET, `session-csrf:v1:${hash}`);
      await db
        .prepare(
          'INSERT INTO sessions(token_hash,user_id,csrf_token_hash,expires_at,created_at,last_seen_at) VALUES(?,?,?,?,?,?)',
        )
        .bind(hash, id, await sha256(csrf), time + 86400, time, time)
        .run();
      return {
        id,
        addressId,
        cartId,
        async request(path, method = 'GET', body, headers = {}) {
          return app.request(
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
            env,
          );
        },
        async cart() {
          const r = await this.request('/cart');
          assert.equal(r.status, 200);
          return (await r.json()).data;
        },
        async quote() {
          const cart = await this.cart(),
            r = await this.request('/checkout/quote', 'POST', {
              addressId,
              cartVersion: cart.version,
            });
          assert.equal(r.status, 200, await r.clone().text());
          return quoteResponseSchema.parse(await r.json()).data;
        },
        async place(quote, key = crypto.randomUUID(), simulation = 'success') {
          return this.request(
            '/checkout',
            'POST',
            { quoteId: quote.id, simulation },
            { 'idempotency-key': key },
          );
        },
      };
    }
    async function stock() {
      return (
        await db
          .prepare('SELECT id,stock FROM product_variants WHERE id IN(?,?) ORDER BY id')
          .bind(...variants)
          .all()
      ).results;
    }
    async function effects(f) {
      return await db
        .prepare(
          `SELECT (SELECT count(*) FROM orders WHERE user_id=?1) AS orders,
      (SELECT count(*) FROM order_items WHERE order_id IN(SELECT id FROM orders WHERE user_id=?1)) AS items,
      (SELECT count(*) FROM inventory_movements WHERE actor_id=?1 AND reason='ORDER') AS movements,
      (SELECT count(*) FROM checkout_idempotency_keys WHERE user_id=?1) AS keys,
      (SELECT count(*) FROM audit_logs WHERE actor_id=?1 AND action='ORDER_CREATED') AS audits`,
        )
        .bind(f.id)
        .first();
    }
    const none = { orders: 0, items: 0, movements: 0, keys: 0, audits: 0 },
      run = (n, fn) => suite.test(n, fn);
    await run('anonymous checkout and order access is denied', async () => {
      for (const [path, method] of [
        ['/checkout/quote', 'POST'],
        ['/checkout', 'POST'],
        ['/orders', 'GET'],
        ['/orders/missing', 'GET'],
      ])
        assert.equal(
          (await app.request(`http://localhost/api${path}`, { method }, env)).status,
          401,
        );
    });
    await run(
      'mutations require Origin/CSRF and strict bodies; cards/prices/owners are never accepted',
      async () => {
        const f = await fixture();
        for (const path of ['/checkout/quote', '/checkout'])
          for (const headers of [{ origin: 'https://evil.test' }, { 'x-csrf-token': 'wrong' }])
            assert.equal((await f.request(path, 'POST', {}, headers)).status, 403);
        for (const extra of [{ userId: 'other' }, { totalMinor: 1 }, { cardNumber: 'demo' }])
          assert.equal(
            (
              await f.request('/checkout/quote', 'POST', {
                addressId: f.addressId,
                cartVersion: 1,
                ...extra,
              })
            ).status,
            400,
          );
        assert.equal(
          (
            await f.request('/checkout', 'POST', {
              quoteId: crypto.randomUUID(),
              simulation: 'success',
            })
          ).status,
          400,
        );
        assert.equal(
          (
            await f.request(
              '/checkout',
              'POST',
              { quoteId: crypto.randomUUID(), simulation: 'real' },
              { 'idempotency-key': crypto.randomUUID() },
            )
          ).status,
          400,
        );
      },
    );
    await run(
      'quotes require an owned address, a nonempty available cart and its current version',
      async () => {
        const a = await fixture(),
          b = await fixture([]);
        assert.equal(
          (await a.request('/checkout/quote', 'POST', { addressId: b.addressId, cartVersion: 1 }))
            .status,
          404,
        );
        assert.equal(
          (await b.request('/checkout/quote', 'POST', { addressId: b.addressId, cartVersion: 0 }))
            .status,
          409,
        );
        assert.equal(
          (await a.request('/checkout/quote', 'POST', { addressId: a.addressId, cartVersion: 0 }))
            .status,
          409,
        );
        await db.prepare('UPDATE product_variants SET stock=0 WHERE id=?').bind(variants[0]).run();
        assert.equal(
          (await a.request('/checkout/quote', 'POST', { addressId: a.addressId, cartVersion: 1 }))
            .status,
          409,
        );
      },
    );
    await run(
      'quotes snapshot authoritative prices/delivery/totals without changing stock or orders',
      async () => {
        const f = await fixture([2, 3]),
          before = await stock(),
          q = await f.quote();
        assert.equal(q.subtotalMinor, 80000);
        assert.equal(q.shippingMinor, 7900);
        assert.equal(q.taxMinor, 4000);
        assert.equal(q.totalMinor, 91900);
        assert.equal(q.delivery.recipient, 'Demo Recipient');
        assert.equal(q.items.length, 2);
        assert.deepEqual(await stock(), before);
        assert.deepEqual(await effects(f), none);
      },
    );
    await run(
      'successful multi-item checkout creates snapshots, exactly-once ledger, audit, key and clears only the owned cart',
      async () => {
        const f = await fixture([2, 3]),
          other = await fixture(),
          q = await f.quote(),
          r = await f.place(q);
        assert.equal(r.status, 201, await r.clone().text());
        const order = orderResponseSchema.parse(await r.json()).data;
        assert.equal(order.status, 'CONFIRMED');
        assert.equal(order.paymentStatus, 'SIMULATED_SUCCESS');
        assert.equal(order.totalMinor, 91900);
        assert.equal(order.items.length, 2);
        assert.deepEqual(await effects(f), {
          orders: 1,
          items: 2,
          movements: 2,
          keys: 1,
          audits: 1,
        });
        assert.deepEqual(await stock(), [
          { id: variants[1], stock: 17 },
          { id: variants[0], stock: 18 },
        ]);
        assert.equal((await f.cart()).itemCount, 0);
        assert.equal((await other.cart()).itemCount, 1);
        const ledger = await db
          .prepare('SELECT sum(quantity_delta) n FROM inventory_movements WHERE order_id=?')
          .bind(order.id)
          .first();
        assert.equal(ledger.n, -5);
      },
    );
    await run(
      'simulated decline creates no order/key/movement and preserves cart/stock',
      async () => {
        const f = await fixture(),
          q = await f.quote(),
          before = await stock(),
          cart = await f.cart();
        const r = await f.place(q, crypto.randomUUID(), 'failure');
        assert.equal(r.status, 402);
        assert.equal((await r.json()).error.code, 'DEMO_PAYMENT_FAILED');
        assert.deepEqual(await stock(), before);
        assert.deepEqual(await f.cart(), cart);
        assert.deepEqual(await effects(f), none);
      },
    );
    await run(
      'same-key retry returns the original order after expiry/cart changes and never clears newly added items',
      async () => {
        const f = await fixture(),
          q = await f.quote(),
          key = crypto.randomUUID(),
          first = await f.place(q, key);
        const saved = orderResponseSchema.parse(await first.json()).data;
        await db.prepare('UPDATE checkout_quotes SET expires_at=1 WHERE id=?').bind(q.id).run();
        await f.request('/cart/items', 'POST', { variantId: variants[1], quantity: 1 });
        const before = await stock();
        const retry = await f.place(q, key);
        assert.equal(retry.status, 200);
        const data = orderResponseSchema.parse(await retry.json());
        assert.equal(data.replayed, true);
        assert.equal(data.data.id, saved.id);
        assert.deepEqual(await stock(), before);
        assert.equal((await f.cart()).itemCount, 1);
        assert.equal((await effects(f)).orders, 1);
      },
    );
    await run(
      'same-key different payload conflicts; consumed quotes cannot create orders with new keys',
      async () => {
        const f = await fixture(),
          q = await f.quote(),
          key = crypto.randomUUID();
        assert.equal((await f.place(q, key)).status, 201);
        assert.equal((await f.place(q, key, 'failure')).status, 409);
        assert.equal((await f.place(q, crypto.randomUUID())).status, 409);
        assert.equal((await effects(f)).orders, 1);
      },
    );
    await run('concurrent same-key requests create one order and return the same ID', async () => {
      const f = await fixture(),
        q = await f.quote(),
        key = crypto.randomUUID();
      const r = await Promise.all([f.place(q, key), f.place(q, key)]);
      assert.deepEqual(r.map((v) => v.status).sort(), [200, 201]);
      const data = await Promise.all(r.map((v) => v.json()));
      assert.equal(data[0].data.id, data[1].data.id);
      assert.equal((await effects(f)).orders, 1);
      assert.equal((await stock()).find((v) => v.id === variants[0]).stock, 19);
    });
    await run('concurrent distinct keys for one quote create only one order', async () => {
      const f = await fixture(),
        q = await f.quote(),
        r = await Promise.all([f.place(q), f.place(q)]);
      assert.deepEqual(r.map((v) => v.status).sort(), [201, 409]);
      assert.equal((await effects(f)).orders, 1);
    });
    await run('two quotes sharing one key cannot both commit', async () => {
      const f = await fixture(),
        q1 = await f.quote(),
        q2 = await f.quote(),
        key = crypto.randomUUID();
      const r = await Promise.all([f.place(q1, key), f.place(q2, key)]);
      assert.deepEqual(r.map((v) => v.status).sort(), [201, 409]);
      assert.equal((await effects(f)).orders, 1);
    });
    await run('two customers competing for the last unit have exactly one winner', async () => {
      const a = await fixture(),
        b = await fixture();
      await db.prepare('UPDATE product_variants SET stock=1 WHERE id=?').bind(variants[0]).run();
      const qa = await a.quote(),
        qb = await b.quote();
      const results = await Promise.all([a.place(qa), b.place(qb)]);
      assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
      assert.equal((await stock()).find((v) => v.id === variants[0]).stock, 0);
      assert.equal((await effects(a)).orders + (await effects(b)).orders, 1);
      assert.equal((await a.cart()).itemCount + (await b.cart()).itemCount, 1);
    });
    await run(
      'a shortage in one quoted line leaves every line and all inventory unchanged',
      async () => {
        const f = await fixture([2, 3]),
          q = await f.quote();
        await db.prepare('UPDATE product_variants SET stock=1 WHERE id=?').bind(variants[1]).run();
        const before = await stock(),
          cart = await f.cart();
        assert.equal((await f.place(q)).status, 409);
        assert.deepEqual(await stock(), before);
        assert.deepEqual(await f.cart(), cart);
        assert.deepEqual(await effects(f), none);
      },
    );
    for (const change of ['price', 'address', 'cart', 'archive', 'inactive', 'expiry', 'pricing'])
      await run(`${change} changes invalidate a quote without partial effects`, async () => {
        const f = await fixture(),
          q = await f.quote();
        if (change === 'price')
          await db
            .prepare('UPDATE product_variants SET price_minor=price_minor+1 WHERE id=?')
            .bind(variants[0])
            .run();
        if (change === 'address')
          await db
            .prepare('UPDATE addresses SET version=version+1,line1=? WHERE id=?')
            .bind('Changed sample lane', f.addressId)
            .run();
        if (change === 'cart')
          await f.request(`/cart/items/${variants[0]}`, 'PUT', {
            quantity: 2,
            version: q.cartVersion,
          });
        if (change === 'archive')
          await db
            .prepare(
              'UPDATE products SET archived=1 WHERE id=(SELECT product_id FROM product_variants WHERE id=?)',
            )
            .bind(variants[0])
            .run();
        if (change === 'inactive')
          await db
            .prepare('UPDATE product_variants SET active=0 WHERE id=?')
            .bind(variants[0])
            .run();
        if (change === 'expiry')
          await db.prepare('UPDATE checkout_quotes SET expires_at=1 WHERE id=?').bind(q.id).run();
        if (change === 'pricing')
          await db
            .prepare("UPDATE checkout_quotes SET pricing_version='old' WHERE id=?")
            .bind(q.id)
            .run();
        const before = await stock(),
          cart = await f.cart();
        assert.equal((await f.place(q)).status, 409);
        assert.deepEqual(await stock(), before);
        assert.deepEqual(await f.cart(), cart);
        assert.deepEqual(await effects(f), none);
      });
    for (const [name, trigger] of [
      ['item insertion', "BEFORE INSERT ON order_items WHEN NEW.variant_id='var-cup-sand'"],
      ['inventory ledger', 'BEFORE INSERT ON inventory_movements'],
      ['cart clearing', 'BEFORE DELETE ON cart_items'],
      ['idempotency insertion', 'BEFORE INSERT ON checkout_idempotency_keys'],
      ['audit insertion', 'BEFORE INSERT ON audit_logs'],
    ])
      await run(`failure during ${name} rolls back the entire checkout`, async () => {
        const f = await fixture([2, 3]),
          q = await f.quote(),
          before = await stock(),
          cart = await f.cart();
        await db
          .prepare(
            `CREATE TRIGGER fail_checkout ${trigger} BEGIN SELECT RAISE(ABORT,'injected failure'); END`,
          )
          .run();
        const response = await f.place(q);
        assert.equal(response.status, 500);
        assert.doesNotMatch(await response.text(), /injected failure|SQLITE|INSERT INTO/);
        await db.prepare('DROP TRIGGER fail_checkout').run();
        assert.deepEqual(await stock(), before);
        assert.deepEqual(await f.cart(), cart);
        assert.deepEqual(await effects(f), none);
      });
    for (const target of ['stock', 'cart'])
      await run(`a silently skipped ${target} mutation causes a full rollback`, async () => {
        const f = await fixture([2, 3]),
          q = await f.quote(),
          before = await stock(),
          cart = await f.cart();
        const spec =
          target === 'stock'
            ? "BEFORE UPDATE ON product_variants WHEN OLD.id='var-cup-sand'"
            : "BEFORE DELETE ON cart_items WHEN OLD.variant_id='var-cup-sand'";
        await db
          .prepare(`CREATE TRIGGER skip_checkout ${spec} BEGIN SELECT RAISE(IGNORE); END`)
          .run();
        assert.equal((await f.place(q)).status, 409);
        await db.prepare('DROP TRIGGER skip_checkout').run();
        assert.deepEqual(await stock(), before);
        assert.deepEqual(await f.cart(), cart);
        assert.deepEqual(await effects(f), none);
      });
    for (const table of ['checkout_idempotency_keys', 'audit_logs'])
      await run(`a silently skipped ${table} write rolls back the entire checkout`, async () => {
        const f = await fixture([2, 3]),
          q = await f.quote(),
          before = await stock(),
          cart = await f.cart();
        await db
          .prepare(
            `CREATE TRIGGER skip_checkout_required BEFORE INSERT ON ${table} BEGIN SELECT RAISE(IGNORE); END`,
          )
          .run();
        try {
          const response = await f.place(q);
          assert.equal(response.status, 500);
          assert.doesNotMatch(await response.text(), /SQLITE|malformed JSON|required write/);
          assert.deepEqual(await stock(), before);
          assert.deepEqual(await f.cart(), cart);
          assert.deepEqual(await effects(f), none);
        } finally {
          await db.prepare('DROP TRIGGER skip_checkout_required').run();
        }
      });
    await run(
      'order reads are owner-scoped and preserve historical price/address snapshots',
      async () => {
        const f = await fixture(),
          other = await fixture([]),
          q = await f.quote(),
          response = await f.place(q),
          order = orderResponseSchema.parse(await response.json()).data;
        await db
          .prepare('UPDATE product_variants SET price_minor=99999 WHERE id=?')
          .bind(variants[0])
          .run();
        await db.prepare('DELETE FROM addresses WHERE id=?').bind(f.addressId).run();
        const detail = await f.request(`/orders/${order.id}`);
        assert.equal(detail.status, 200);
        assert.deepEqual(orderResponseSchema.parse(await detail.json()).data, order);
        assert.equal((await other.request(`/orders/${order.id}`)).status, 404);
        assert.equal((await f.request('/orders/missing')).status, 404);
        const list = orderListResponseSchema.parse(await (await f.request('/orders')).json());
        assert.equal(list.data.length, 1);
        assert.equal(list.meta.total, 1);
        assert.equal(list.data[0].id, order.id);
        assert.equal(
          orderListResponseSchema.parse(await (await other.request('/orders')).json()).data.length,
          0,
        );
        for (const query of ['page=0', 'page=1&page=2', 'userId=other', 'page=abc'])
          assert.equal((await f.request(`/orders?${query}`)).status, 400);
      },
    );
    await run('idempotency keys are scoped to the account', async () => {
      const a = await fixture(),
        b = await fixture(),
        qa = await a.quote(),
        qb = await b.quote(),
        key = crypto.randomUUID();
      const responses = await Promise.all([a.place(qa, key), b.place(qb, key)]);
      assert.deepEqual(
        responses.map((r) => r.status),
        [201, 201],
      );
      const results = await Promise.all(responses.map((r) => r.json()));
      assert.notEqual(results[0].data.id, results[1].data.id);
      assert.equal((await a.request(`/orders/${results[1].data.id}`)).status, 404);
    });
    await run(
      'order pagination has ten rows, stable disjoint pages and an empty final page',
      async () => {
        const f = await fixture();
        for (let i = 0; i < 11; i++) {
          if (i > 0)
            await f.request('/cart/items', 'POST', { variantId: variants[0], quantity: 1 });
          assert.equal((await f.place(await f.quote())).status, 201);
        }
        const pages = await Promise.all(
          [1, 2, 3].map(async (page) =>
            orderListResponseSchema.parse(await (await f.request(`/orders?page=${page}`)).json()),
          ),
        );
        assert.equal(pages[0].data.length, 10);
        assert.equal(pages[1].data.length, 1);
        assert.equal(pages[2].data.length, 0);
        assert.equal(pages[0].meta.total, 11);
        assert.equal(pages[0].meta.totalPages, 2);
        assert.equal(new Set([...pages[0].data, ...pages[1].data].map((o) => o.id)).size, 11);
      },
    );
    await run('foreign quotes cannot be ordered and unused quote history is bounded', async () => {
      const a = await fixture(),
        b = await fixture([]),
        q = await a.quote();
      assert.equal((await b.place(q)).status, 404);
      // Give the historical quote a distinct age. SQLite timestamps have second
      // precision; random UUID ordering must not decide this retention assertion.
      await db
        .prepare('UPDATE checkout_quotes SET created_at=created_at-60 WHERE id=?')
        .bind(q.id)
        .run();
      for (let i = 0; i < 6; i++) await a.quote();
      assert.equal(
        (
          await db
            .prepare('SELECT count(*) n FROM checkout_quotes WHERE user_id=?')
            .bind(a.id)
            .first()
        ).n,
        5,
      );
      assert.equal((await a.place(q)).status, 404);
    });
  } finally {
    await mf.dispose();
  }
});
