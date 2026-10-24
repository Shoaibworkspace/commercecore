import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Miniflare } from 'miniflare';
import { app } from '../worker/app.ts';
import { sha256, hmac } from '../worker/services/crypto.ts';
import { applySQL } from './helpers/sql.mjs';
import {
  adminProductResponseSchema,
  analyticsResponseSchema,
  adminOrdersResponseSchema,
} from '../shared/admin.ts';

test('administration: real D1 roles, audit, inventory and order lifecycle', async (suite) => {
  const config = JSON.parse(readFileSync('wrangler.jsonc', 'utf8'));
  const mf = new Miniflare({
    modules: true,
    script: 'export default {fetch(){return new Response("test")}}',
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
    let count = 0;
    async function client(role = 'customer') {
      const id = `admin-test-${++count}`,
        token = randomBytes(32).toString('hex'),
        hash = await sha256(token),
        csrf = await hmac(env.AUTH_SECRET, `session-csrf:v1:${hash}`),
        now = Math.floor(Date.now() / 1000);
      await db
        .prepare('INSERT INTO users(id,email,name,password_hash,role) VALUES(?,?,?,?,?)')
        .bind(id, `${id}@example.test`, id, 'test-only', role)
        .run();
      await db
        .prepare(
          'INSERT INTO sessions(token_hash,user_id,csrf_token_hash,expires_at,created_at,last_seen_at) VALUES(?,?,?,?,?,?)',
        )
        .bind(hash, id, await sha256(csrf), now + 86400, now, now)
        .run();
      return {
        id,
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
      };
    }
    const admin = await client('admin'),
      customer = await client(),
      stranger = await client();
    async function json(response, status = 200) {
      assert.equal(response.status, status, await response.clone().text());
      return (await response.json()).data;
    }
    const getProduct = async (id = 'prod-tote') =>
      adminProductResponseSchema.parse(await (await admin.request(`/admin/products/${id}`)).json())
        .data;
    const variantId = 'var-bag-natural';
    const vrow = () =>
      db.prepare('SELECT stock,version FROM product_variants WHERE id=?').bind(variantId).first();
    const auditCount = () =>
      db
        .prepare('SELECT count(*) AS n FROM audit_logs')
        .first()
        .then((r) => r.n);
    const stockChange = async (delta, version, note = 'Test adjustment') =>
      admin.request(`/admin/inventory/${variantId}/adjust`, 'POST', { delta, version, note });
    async function order(owner = customer, quantity = 1) {
      const addressId = crypto.randomUUID();
      await db
        .prepare(
          "INSERT INTO addresses(id,user_id,recipient,line1,city,region,postal_code,phone) VALUES(?,?,'Sample Recipient','12 Sample Lane','Demo City','Demo State','110001','5551234567')",
        )
        .bind(addressId, owner.id)
        .run();
      await db
        .prepare('UPDATE product_variants SET stock=100,active=1 WHERE id=?')
        .bind(variantId)
        .run();
      await db
        .prepare(
          'UPDATE products SET archived=0 WHERE id=(SELECT product_id FROM product_variants WHERE id=?)',
        )
        .bind(variantId)
        .run();
      await json(await owner.request('/cart/items', 'POST', { variantId, quantity }), 200);
      const cart = await json(await owner.request('/cart')),
        quote = await json(
          await owner.request('/checkout/quote', 'POST', { addressId, cartVersion: cart.version }),
        );
      return json(
        await owner.request(
          '/checkout',
          'POST',
          { quoteId: quote.id, simulation: 'success' },
          { 'idempotency-key': crypto.randomUUID() },
        ),
        201,
      );
    }
    const transition = (o, status, version = o.version) =>
      admin.request(`/admin/orders/${o.id}/status`, 'PATCH', { version, status });
    await suite.test(
      'anonymous and forged customer roles cannot read or write any admin surface',
      async () => {
        for (const [path, method] of [
          ['/products', 'GET'],
          ['/categories', 'POST'],
          ['/analytics', 'GET'],
          ['/orders', 'GET'],
          ['/audit', 'GET'],
          [`/inventory/${variantId}/adjust`, 'POST'],
        ]) {
          assert.equal(
            (await app.request(`http://localhost/api/admin${path}`, { method }, env)).status,
            401,
          );
          assert.equal(
            (await customer.request(`/admin${path}`, method, undefined, { 'x-role': 'admin' }))
              .status,
            403,
          );
        }
      },
    );
    await suite.test('administrator role is read from DB on every request', async () => {
      const temporary = await client('admin');
      assert.equal((await temporary.request('/admin/status')).status, 200);
      await db.prepare("UPDATE users SET role='customer' WHERE id=?").bind(temporary.id).run();
      assert.equal((await temporary.request('/admin/status')).status, 403);
    });
    await suite.test(
      'Origin, CSRF, strict inputs, pages and image allowlist are enforced',
      async () => {
        for (const headers of [{ origin: 'https://evil.test' }, { 'x-csrf-token': 'wrong' }])
          assert.equal(
            (
              await admin.request(
                `/admin/inventory/${variantId}/adjust`,
                'POST',
                { delta: 1, version: 0, note: 'test' },
                headers,
              )
            ).status,
            403,
          );
        for (const path of [
          '/products?page=0',
          '/products?page=1&page=2',
          '/analytics?days=90',
          '/orders?status=BOGUS',
          '/audit?unknown=1',
        ])
          assert.equal((await admin.request(`/admin${path}`)).status, 400);
        assert.equal(
          (
            await admin.request('/admin/categories', 'POST', {
              name: 'Bad',
              slug: 'bad',
              description: '',
              image: '/images/missing.webp',
            })
          ).status,
          400,
        );
        assert.equal((await stockChange(0, 0)).status, 400);
        assert.equal(
          (
            await admin.request(`/admin/inventory/${variantId}/adjust`, 'POST', {
              delta: 1,
              version: 0,
              note: 'test',
              actorId: customer.id,
            })
          ).status,
          400,
        );
      },
    );
    let category, product;
    const variant = {
      sku: 'PH7-TEST',
      label: 'Natural',
      color: '#abc123',
      size: '',
      priceMinor: 12500,
      image: '/images/photos/tote-main.webp',
      detailImage: '/images/photos/tote-alt.webp',
      active: true,
      position: 0,
    };
    const metadata = {
      categoryId: '',
      slug: 'phase-seven-test',
      name: 'Phase Seven Test',
      description: 'A local fixture product.',
      subtitle: 'For tests',
      material: 'Canvas',
      dimensions: '20 cm',
      care: 'Wipe clean',
      featured: false,
      isNew: true,
    };
    await suite.test(
      'create category, product, gallery and variants with actor/request audit',
      async () => {
        category = await json(
          await admin.request('/admin/categories', 'POST', {
            slug: 'phase-seven',
            name: 'Phase Seven',
            description: 'Local test',
            image: variant.image,
          }),
          201,
        );
        metadata.categoryId = category.id;
        product = await json(
          await admin.request('/admin/products', 'POST', {
            ...metadata,
            variants: [variant],
            gallery: [{ image: variant.image, alt: metadata.name }],
          }),
          201,
        );
        const p = await getProduct(product.id);
        assert.equal(p.variants.length, 1);
        assert.equal(p.variants[0].stock, 0);
        const audit = await db
          .prepare(
            "SELECT actor_id,request_id FROM audit_logs WHERE entity_id=? AND action='PRODUCT_CREATED'",
          )
          .bind(product.id)
          .first();
        assert.equal(audit.actor_id, admin.id);
        assert.ok(audit.request_id);
        assert.equal(
          (
            await admin.request('/admin/products', 'POST', {
              ...metadata,
              slug: 'bad-stock',
              variants: [{ ...variant, sku: 'OTHER', stock: 20 }],
              gallery: [{ image: variant.image, alt: 'Test' }],
            })
          ).status,
          400,
        );
      },
    );
    await suite.test(
      'product/category/variant/image edits reject stale versions and keep stock out of metadata',
      async () => {
        await json(
          await admin.request(`/admin/products/${product.id}`, 'PATCH', {
            ...metadata,
            name: 'Updated test',
            version: 0,
          }),
        );
        const before = await auditCount();
        assert.equal(
          (
            await admin.request(`/admin/products/${product.id}`, 'PATCH', {
              ...metadata,
              version: 0,
            })
          ).status,
          409,
        );
        assert.equal(await auditCount(), before);
        await json(
          await admin.request(`/admin/products/${product.id}/images/0`, 'PUT', {
            version: 1,
            image: variant.detailImage,
            alt: 'Detail',
          }),
        );
        assert.equal(
          (
            await admin.request(`/admin/products/${product.id}/images/0`, 'PUT', {
              version: 1,
              image: variant.image,
              alt: 'Stale',
            })
          ).status,
          409,
        );
        const p = await getProduct(product.id);
        assert.equal(p.gallery[0].image, variant.detailImage);
        assert.equal(p.version, 2);
        await json(
          await admin.request(`/admin/variants/${p.variants[0].id}`, 'PATCH', {
            ...variant,
            priceMinor: 15000,
            version: 0,
          }),
        );
        assert.equal((await getProduct(product.id)).variants[0].stock, 0);
        await json(
          await admin.request(`/admin/categories/${category.id}`, 'PATCH', {
            slug: 'phase-seven',
            name: 'Phase Seven Updated',
            description: '',
            image: variant.image,
            version: 0,
          }),
        );
        assert.equal(
          (
            await admin.request(`/admin/categories/${category.id}`, 'PATCH', {
              slug: 'phase-seven',
              name: 'Stale',
              description: '',
              image: variant.image,
              version: 0,
            })
          ).status,
          409,
        );
        await json(
          await admin.request(`/admin/products/${product.id}/variants`, 'POST', {
            ...variant,
            sku: 'PH7-SECOND',
            label: 'Second',
          }),
          201,
        );
      },
    );
    await suite.test(
      'archive hides product from public catalog and restore retains versions',
      async () => {
        await json(
          await admin.request(`/admin/products/${product.id}/archive`, 'PATCH', {
            version: 2,
            archived: true,
          }),
        );
        assert.equal((await app.request('/api/products/phase-seven-test', {}, env)).status, 404);
        await json(
          await admin.request(`/admin/products/${product.id}/archive`, 'PATCH', {
            version: 3,
            archived: false,
          }),
        );
        assert.equal((await app.request('/api/products/phase-seven-test', {}, env)).status, 200);
      },
    );
    await suite.test('catalog mutation rolls back when its audit fails', async () => {
      const p = await getProduct(product.id);
      await db
        .prepare(
          "CREATE TRIGGER fail_admin_audit BEFORE INSERT ON audit_logs WHEN NEW.action='PRODUCT_UPDATED' BEGIN SELECT RAISE(ABORT,'test audit failure'); END",
        )
        .run();
      try {
        assert.equal(
          (
            await admin.request(`/admin/products/${product.id}`, 'PATCH', {
              ...metadata,
              name: 'Must roll back',
              version: p.version,
            })
          ).status,
          503,
        );
        assert.equal((await getProduct(product.id)).name, p.name);
      } finally {
        await db.prepare('DROP TRIGGER fail_admin_audit').run();
      }
    });
    await suite.test(
      'stock receipt/decrement writes one ledger and audit; bounds/stale versions have no effect',
      async () => {
        const v = await vrow(),
          before = await auditCount();
        await json(await stockChange(4, v.version));
        assert.equal((await vrow()).stock, v.stock + 4);
        assert.equal(await auditCount(), before + 1);
        assert.equal((await stockChange(4, v.version)).status, 409);
        let current = await vrow();
        assert.equal((await stockChange(-current.stock - 1, current.version)).status, 409);
        assert.equal((await stockChange(1000000, current.version)).status, 409);
        await json(await stockChange(-2, current.version));
        assert.equal((await vrow()).stock, v.stock + 2);
      },
    );
    await suite.test('concurrent stock saves have exactly one winner', async () => {
      const v = await vrow(),
        results = await Promise.all([stockChange(1, v.version), stockChange(2, v.version)]);
      assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
      assert.ok([v.stock + 1, v.stock + 2].includes((await vrow()).stock));
    });
    for (const target of ['ledger', 'audit', 'inventory'])
      await suite.test(`stock ${target} failure rolls back all adjustment effects`, async () => {
        const before = await vrow(),
          audits = await auditCount(),
          ledger = await db
            .prepare("SELECT count(*) AS n FROM inventory_movements WHERE reason='ADJUSTMENT'")
            .first();
        const sql =
          target === 'ledger'
            ? "CREATE TRIGGER fail_adjust BEFORE INSERT ON inventory_movements WHEN NEW.reason='ADJUSTMENT' BEGIN SELECT RAISE(ABORT,'test'); END"
            : target === 'audit'
              ? "CREATE TRIGGER fail_adjust BEFORE INSERT ON audit_logs WHEN NEW.action='STOCK_ADJUSTED' BEGIN SELECT RAISE(ABORT,'test'); END"
              : 'CREATE TRIGGER fail_adjust BEFORE UPDATE OF stock ON product_variants BEGIN SELECT RAISE(IGNORE); END';
        await db.prepare(sql).run();
        try {
          assert.equal(
            (await stockChange(1, before.version)).status,
            target === 'inventory' ? 409 : 500,
          );
          assert.deepEqual(await vrow(), before);
          assert.equal(await auditCount(), audits);
          assert.deepEqual(
            await db
              .prepare("SELECT count(*) AS n FROM inventory_movements WHERE reason='ADJUSTMENT'")
              .first(),
            ledger,
          );
        } finally {
          await db.prepare('DROP TRIGGER fail_adjust').run();
        }
      });
    await suite.test(
      'customer cancellation restores exactly once across concurrent clicks and retries',
      async () => {
        const o = await order(),
          before = await vrow(),
          cancel = () => customer.request(`/orders/${o.id}/cancel`, 'POST', { version: o.version });
        const results = await Promise.all([cancel(), cancel()]);
        for (const r of results) assert.equal(r.status, 200, await r.text());
        assert.equal((await vrow()).stock, before.stock + 1);
        assert.equal((await json(await cancel())).status, 'CANCELLED');
        assert.equal((await vrow()).stock, before.stock + 1);
        assert.equal(
          (
            await db
              .prepare(
                "SELECT count(*) AS n FROM inventory_movements WHERE order_id=? AND reason='CANCELLATION'",
              )
              .bind(o.id)
              .first()
          ).n,
          1,
        );
        assert.equal(
          (
            await db
              .prepare(
                "SELECT count(*) AS n FROM audit_logs WHERE entity_id=? AND action='ORDER_CANCELLED'",
              )
              .bind(o.id)
              .first()
          ).n,
          1,
        );
      },
    );
    await suite.test(
      'customer ownership and CSRF cannot be bypassed for cancellation',
      async () => {
        const o = await order();
        assert.equal(
          (await stranger.request(`/orders/${o.id}/cancel`, 'POST', { version: 0 })).status,
          404,
        );
        assert.equal(
          (
            await customer.request(
              `/orders/${o.id}/cancel`,
              'POST',
              { version: 0 },
              { 'x-csrf-token': 'bad' },
            )
          ).status,
          403,
        );
        assert.equal(
          (
            await customer.request(`/orders/${o.id}/cancel`, 'POST', {
              version: 0,
              status: 'DELIVERED',
            })
          ).status,
          400,
        );
      },
    );
    await suite.test(
      'fulfillment follows every legal step; shipped and terminal states cannot cancel or reopen',
      async () => {
        let o = await order();
        assert.equal((await transition(o, 'SHIPPED')).status, 409);
        o = await json(await transition(o, 'PROCESSING'));
        o = await json(await transition(o, 'SHIPPED'));
        assert.equal(
          (await customer.request(`/orders/${o.id}/cancel`, 'POST', { version: o.version })).status,
          409,
        );
        o = await json(await transition(o, 'DELIVERED'));
        assert.equal((await transition(o, 'PROCESSING')).status, 409);
        assert.equal((await transition(o, 'CANCELLED')).status, 409);
      },
    );
    await suite.test(
      'processing can cancel; stale transition conflicts; cancellation vs shipping has one winner',
      async () => {
        let o = await order();
        const initial = o;
        o = await json(await transition(o, 'PROCESSING'));
        assert.equal((await transition(initial, 'SHIPPED')).status, 409);
        const stock = await vrow(),
          results = await Promise.all([
            transition(o, 'SHIPPED'),
            customer.request(`/orders/${o.id}/cancel`, 'POST', { version: o.version }),
          ]);
        assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
        const saved = await json(await admin.request(`/admin/orders/${o.id}`));
        assert.equal((await vrow()).stock, stock.stock + (saved.status === 'CANCELLED' ? 1 : 0));
      },
    );
    for (const stage of ['stock', 'ledger', 'audit'])
      await suite.test(
        `cancellation ${stage} failure restores neither status nor stock`,
        async () => {
          const o = await order(),
            before = await vrow(),
            audits = await auditCount();
          await db
            .prepare(
              stage === 'stock'
                ? 'CREATE TRIGGER fail_cancel BEFORE UPDATE OF stock ON product_variants BEGIN SELECT RAISE(IGNORE); END'
                : stage === 'ledger'
                  ? "CREATE TRIGGER fail_cancel BEFORE INSERT ON inventory_movements WHEN NEW.reason='CANCELLATION' BEGIN SELECT RAISE(ABORT,'test'); END"
                  : "CREATE TRIGGER fail_cancel BEFORE INSERT ON audit_logs WHEN NEW.action='ORDER_CANCELLED' BEGIN SELECT RAISE(ABORT,'test'); END",
            )
            .run();
          try {
            assert.equal((await transition(o, 'CANCELLED')).status, stage === 'stock' ? 409 : 500);
            assert.deepEqual(await vrow(), before);
            assert.equal(
              (await json(await customer.request(`/orders/${o.id}`))).status,
              'CONFIRMED',
            );
            assert.equal(await auditCount(), audits);
            assert.equal(
              (
                await db
                  .prepare(
                    "SELECT count(*) AS n FROM inventory_movements WHERE order_id=? AND reason='CANCELLATION'",
                  )
                  .bind(o.id)
                  .first()
              ).n,
              0,
            );
          } finally {
            await db.prepare('DROP TRIGGER fail_cancel').run();
          }
        },
      );
    await suite.test(
      'analytics match SQL totals, daily UTC series, top items and bounded pages',
      async () => {
        const response = await admin.request('/admin/analytics?days=30');
        assert.equal(response.status, 200, await response.clone().text());
        const data = analyticsResponseSchema.parse(await response.json()).data;
        const totals = await db
          .prepare(
            "SELECT count(*) AS orders,sum(CASE WHEN payment_status='SIMULATED_SUCCESS' AND status<>'CANCELLED' THEN total_minor ELSE 0 END) AS net FROM orders",
          )
          .first();
        const sold = await db
          .prepare(
            "SELECT coalesce(sum(i.quantity),0) AS units FROM order_items i JOIN orders o ON o.id=i.order_id WHERE o.payment_status='SIMULATED_SUCCESS' AND o.status<>'CANCELLED'",
          )
          .first();
        assert.equal(data.productsSold, sold.units);
        assert.equal(
          data.ordersByStatus.reduce((sum, row) => sum + row.count, 0),
          totals.orders,
        );
        assert.equal(data.recentOrders.length, Math.min(5, totals.orders));
        assert.equal(data.orders, totals.orders);
        assert.equal(data.netMinor, totals.net);
        assert.equal(data.grossMinor - data.cancelledMinor, data.netMinor);
        assert.equal(data.daily.length, 30);
        assert.equal(
          data.daily.reduce((n, d) => n + d.totalMinor, 0),
          data.netMinor,
        );
        const orders = await admin.request('/admin/orders?status=CANCELLED');
        const list = adminOrdersResponseSchema.parse(await orders.json());
        assert.ok(list.data.every((o) => o.status === 'CANCELLED'));
        for (const path of [
          '/admin/inventory/movements?page=1',
          '/admin/audit?page=1',
          '/admin/products?page=9999',
        ]) {
          const r = await admin.request(path);
          assert.equal(r.status, 200, await r.clone().text());
          const body = await r.json();
          assert.ok(body.data.length <= 20);
          assert.ok(body.meta.totalPages >= 1);
        }
      },
    );
    for (const action of ['STOCK_ADJUSTED', 'PRODUCT_UPDATED', 'ORDER_CANCELLED'])
      await suite.test(`silently ignored ${action} audit rolls back its mutation`, async () => {
        const o = action === 'ORDER_CANCELLED' ? await order() : null,
          p = action === 'PRODUCT_UPDATED' ? await getProduct(product.id) : null,
          before = await vrow(),
          audits = await auditCount();
        await db
          .prepare(
            `CREATE TRIGGER skip_audit BEFORE INSERT ON audit_logs WHEN NEW.action='${action}' BEGIN SELECT RAISE(IGNORE); END`,
          )
          .run();
        try {
          const response =
            action === 'STOCK_ADJUSTED'
              ? await stockChange(2, before.version)
              : action === 'PRODUCT_UPDATED'
                ? await admin.request(`/admin/products/${product.id}`, 'PATCH', {
                    ...metadata,
                    name: 'Skipped audit',
                    version: p.version,
                  })
                : await transition(o, 'CANCELLED');
          assert.equal(response.status, 409, await response.text());
          assert.deepEqual(await vrow(), before);
          assert.equal(await auditCount(), audits);
          if (p) assert.equal((await getProduct(product.id)).name, p.name);
          if (o)
            assert.equal(
              (await json(await customer.request(`/orders/${o.id}`))).status,
              'CONFIRMED',
            );
        } finally {
          await db.prepare('DROP TRIGGER skip_audit').run();
        }
      });
    await suite.test(
      'cancellation restores every line and matches each original order movement',
      async () => {
        const second = 'var-cup-sand';
        await db.prepare('UPDATE product_variants SET stock=20 WHERE id=?').bind(second).run();
        await json(
          await customer.request('/cart/items', 'POST', { variantId: second, quantity: 2 }),
        );
        const o = await order(customer, 3),
          before = await vrow(),
          secondBefore = await db
            .prepare('SELECT stock FROM product_variants WHERE id=?')
            .bind(second)
            .first();
        assert.equal(o.items.length, 2);
        await json(await transition(o, 'CANCELLED'));
        assert.equal((await vrow()).stock, before.stock + 3);
        assert.equal(
          (await db.prepare('SELECT stock FROM product_variants WHERE id=?').bind(second).first())
            .stock,
          secondBefore.stock + 2,
        );
        assert.equal(
          (
            await db
              .prepare(
                "SELECT count(*) AS n FROM inventory_movements WHERE order_id=? AND reason='CANCELLATION'",
              )
              .bind(o.id)
              .first()
          ).n,
          2,
        );
      },
    );
    await suite.test(
      'stock cap or missing original ledger prevents unsafe restoration',
      async () => {
        const o = await order();
        await db
          .prepare('UPDATE product_variants SET stock=1000000 WHERE id=?')
          .bind(variantId)
          .run();
        assert.equal((await transition(o, 'CANCELLED')).status, 409);
        assert.equal((await vrow()).stock, 1000000);
        await db.prepare('UPDATE product_variants SET stock=10 WHERE id=?').bind(variantId).run();
        await db
          .prepare("DELETE FROM inventory_movements WHERE order_id=? AND reason='ORDER'")
          .bind(o.id)
          .run();
        assert.equal((await transition(o, 'CANCELLED')).status, 409);
        assert.equal((await vrow()).stock, 10);
      },
    );
    await suite.test(
      'silently skipped cancellation ledger aborts status, stock and audit',
      async () => {
        const o = await order(),
          before = await vrow(),
          audits = await auditCount();
        await db
          .prepare(
            "CREATE TRIGGER skip_cancel_ledger BEFORE INSERT ON inventory_movements WHEN NEW.reason='CANCELLATION' BEGIN SELECT RAISE(IGNORE); END",
          )
          .run();
        try {
          assert.equal((await transition(o, 'CANCELLED')).status, 409);
          assert.deepEqual(await vrow(), before);
          assert.equal(await auditCount(), audits);
          assert.equal((await json(await customer.request(`/orders/${o.id}`))).status, 'CONFIRMED');
        } finally {
          await db.prepare('DROP TRIGGER skip_cancel_ledger').run();
        }
      },
    );
    assert.equal((await app.request('http://localhost/api/ready', {}, env)).status, 200);
  } finally {
    await mf.dispose();
  }
});
