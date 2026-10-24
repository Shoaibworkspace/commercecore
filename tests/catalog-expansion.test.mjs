import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { Miniflare } from 'miniflare';
import { app } from '../backend/src/app.ts';
import { applySQL } from './helpers/sql.mjs';
import { catalogSchema, productListSchema } from '../shared/catalog.ts';
import { variantInputSchema } from '../shared/admin.ts';
import { expandedProducts } from '../scripts/expanded-catalog-data.mjs';
import { discountPercent } from '../frontend/src/features/catalog/model.ts';
import { readCart, writeCart } from '../backend/src/repositories/cart.ts';
import { createQuote, placeOrder } from '../backend/src/services/checkout.ts';
import { saveWishlist, readWishlist } from '../backend/src/repositories/wishlist.ts';
import { updateVariant } from '../backend/src/services/catalog-management.ts';

test('100 distinct sample products have complete local photos, sizes and honest sale metadata', () => {
  const products = catalogSchema.parse(
    JSON.parse(readFileSync('frontend/public/catalog.json', 'utf8')),
  );
  assert.equal(products.length, 100);
  assert.equal(new Set(products.map((p) => p.id)).size, 100);
  assert.equal(new Set(products.map((p) => p.slug)).size, 100);
  assert.deepEqual(
    Object.fromEntries(
      ['clothing', 'electronics', 'jewellery', 'footwear', 'home', 'everyday', 'workspace'].map(
        (c) => [c, products.filter((p) => p.category === c).length],
      ),
    ),
    {
      clothing: 24,
      electronics: 20,
      jewellery: 16,
      footwear: 8,
      home: 14,
      everyday: 14,
      workspace: 4,
    },
  );
  assert.equal(products.filter((p) => p.variants.some((v) => v.compareAtMinor)).length, 61);
  assert.equal(
    products.reduce((n, p) => n + p.variants.length, 0),
    220,
  );
  const provenance = JSON.parse(
    readFileSync('frontend/public/images/photos/expanded-provenance.json', 'utf8'),
  );
  assert.equal(provenance.assets.length, 88);
  assert.equal(new Set(provenance.assets.map((p) => p.path)).size, 88);
  for (const p of products)
    for (const v of p.variants) {
      assert.ok(existsSync(`frontend/public${v.image}`), v.image);
      assert.ok(existsSync(`frontend/public${v.detailImage}`), v.detailImage);
      if (v.compareAtMinor) assert.ok(v.compareAtMinor > v.priceMinor);
      if (['clothing', 'footwear'].includes(p.category)) assert.ok(v.size);
    }
});

test('sale contracts reject fake comparison prices and keep discount percentages conservative', () => {
  const p = expandedProducts[0],
    v = { ...p.variants[0], sku: 'SALE-TEST', active: true, position: 0 };
  delete v.id;
  delete v.stock;
  assert.equal(variantInputSchema.safeParse(v).success, true);
  for (const compareAtMinor of [v.priceMinor, v.priceMinor - 1, -1, 10.5, 100000001])
    assert.equal(variantInputSchema.safeParse({ ...v, compareAtMinor }).success, false);
  assert.equal(variantInputSchema.safeParse({ ...v, compareAtMinor: null }).success, true);
  assert.equal(discountPercent({ priceMinor: 59900, compareAtMinor: 79900 }), 25);
  assert.equal(discountPercent({ priceMinor: 79900, compareAtMinor: null }), 0);
});

test('expanded D1 catalog preserves existing data, paginates all categories and charges sale prices', async (suite) => {
  const config = JSON.parse(readFileSync('wrangler.jsonc', 'utf8'));
  const mf = new Miniflare({
    modules: true,
    script: 'export default {fetch(){return new Response("test")}}',
    compatibilityDate: config.compatibility_date,
    d1Databases: ['DB'],
  });
  try {
    const db = await mf.getD1Database('DB');
    for (const f of readdirSync('backend/db/migrations')
      .filter((f) => /^\d+.*\.sql$/.test(f))
      .sort())
      await applySQL(db, `backend/db/migrations/${f}`);
    await applySQL(db, 'backend/db/seed/catalog.sql');
    await applySQL(db, 'backend/db/seed/storefront.sql');
    await db
      .prepare(
        "UPDATE product_variants SET price_minor=54321,stock=2,version=1 WHERE id='var-lamp-sage'",
      )
      .run();
    await db
      .prepare("UPDATE products SET subtitle='Keep my edit',version=1 WHERE id='prod-lamp'")
      .run();
    await applySQL(db, 'backend/db/seed/expanded.sql');
    const env = { DB: db, APP_ENV: 'development', PAYMENT_MODE: 'demo' };
    const list = async (q = '') => {
      const r = await app.request(`/api/products?${q}`, {}, env);
      assert.equal(r.status, 200, await r.clone().text());
      return productListSchema.parse(await r.json());
    };
    await suite.test(
      '100 products across bounded pages, no duplicate IDs and correct category and sale totals',
      async () => {
        const ids = [];
        for (let page = 1; page <= 5; page++) {
          const result = await list(`pageSize=24&page=${page}`);
          assert.equal(result.meta.total, 100);
          assert.equal(result.meta.totalPages, 5);
          ids.push(...result.data.map((p) => p.id));
        }
        assert.equal(new Set(ids).size, 100);
        assert.equal(ids.length, 100);
        for (const [category, n] of [
          ['clothing', 24],
          ['electronics', 20],
          ['jewellery', 16],
          ['footwear', 8],
        ])
          assert.equal((await list(`category=${category}`)).meta.total, n);
        const sale = await list('sale=1&stock=1&pageSize=24');
        assert.equal(sale.meta.total, 61);
        assert.ok(
          sale.data.every((p) =>
            p.variants.some((v) => v.compareAtMinor > v.priceMinor && v.stock > 0),
          ),
        );
        assert.equal(
          (await list('category=clothing&maxPrice=60000&sale=1')).data[0].slug,
          'classic-cotton-tee',
        );
        assert.equal((await list('q=jhumka')).meta.total, 1);
        assert.equal((await app.request('/api/products?sale=invalid', {}, env)).status, 400);
      },
    );
    await suite.test(
      'rerunning all seeds preserves original IDs, stock, prices and edits',
      async () => {
        await applySQL(db, 'backend/db/seed/catalog.sql');
        await applySQL(db, 'backend/db/seed/storefront.sql');
        await applySQL(db, 'backend/db/seed/expanded.sql');
        assert.deepEqual(
          await db
            .prepare(
              "SELECT stock,price_minor,version FROM product_variants WHERE id='var-lamp-sage'",
            )
            .first(),
          { stock: 2, price_minor: 54321, version: 1 },
        );
        assert.equal(
          (await db.prepare("SELECT subtitle FROM products WHERE id='prod-lamp'").first()).subtitle,
          'Keep my edit',
        );
        assert.equal(
          (await db.prepare("SELECT id FROM products WHERE slug='daily-canvas-tote'").first()).id,
          'prod-bag',
        );
        assert.equal((await db.prepare('SELECT count(*) AS n FROM products').first()).n, 100);
        assert.equal(
          (await db.prepare('SELECT count(*) AS n FROM product_variants').first()).n,
          220,
        );
        assert.deepEqual((await db.prepare('PRAGMA foreign_key_check').all()).results, []);
        assert.equal(
          (
            await db
              .prepare(
                "SELECT count(*) AS n FROM product_variants v WHERE v.id LIKE 'var-classic-cotton-tee-%' AND v.stock != (SELECT sum(quantity_delta) FROM inventory_movements WHERE variant_id=v.id)",
              )
              .first()
          ).n,
          0,
        );
      },
    );
    await suite.test('database rejects comparison prices below the selling price', async () => {
      await assert.rejects(
        db
          .prepare(
            "UPDATE product_variants SET compare_at_minor=price_minor WHERE id='var-classic-cotton-tee-0'",
          )
          .run(),
      );
      await assert.rejects(
        db
          .prepare(
            "UPDATE product_variants SET price_minor=compare_at_minor WHERE id='var-classic-cotton-tee-0'",
          )
          .run(),
      );
    });
    await suite.test('sale, price and stock predicates match the same active size', async () => {
      const productId = 'prod-classic-cotton-tee',
        variantId = 'var-classic-cotton-tee-0';
      try {
        await db
          .prepare(
            'UPDATE product_variants SET price_minor=30000,compare_at_minor=NULL,stock=10 WHERE product_id=?',
          )
          .bind(productId)
          .run();
        await db
          .prepare(
            'UPDATE product_variants SET price_minor=10000,compare_at_minor=20000,stock=0 WHERE id=?',
          )
          .bind(variantId)
          .run();
        assert.equal(
          (await list('q=classic%20cotton%20tee&maxPrice=15000&sale=1&stock=1')).meta.total,
          0,
        );
        assert.equal((await list('q=classic%20cotton%20tee&maxPrice=15000&sale=1')).meta.total, 1);
        await db.prepare('UPDATE product_variants SET active=0 WHERE id=?').bind(variantId).run();
        assert.equal((await list('q=classic%20cotton%20tee&sale=1')).meta.total, 0);
      } finally {
        await db
          .prepare(
            'UPDATE product_variants SET price_minor=59900,compare_at_minor=79900,stock=10+position,active=1 WHERE product_id=?',
          )
          .bind(productId)
          .run();
      }
    });
    await suite.test(
      'selected clothing size and electronics use selling prices through cart, quote and atomic order snapshot',
      async () => {
        await db.batch([
          db.prepare(
            "INSERT INTO users(id,email,name,password_hash) VALUES('sale-user','sale@example.test','Sale QA','test-only')",
          ),
          db.prepare(
            "INSERT INTO addresses(id,user_id,recipient,line1,city,region,postal_code,country_code,phone,is_default) VALUES('sale-address','sale-user','Demo Recipient','12 Sample Lane','Demo City','Demo State','110001','IN','5551234567',1)",
          ),
        ]);
        const tee = 'var-classic-cotton-tee-2',
          headphones = 'var-studio-over-ear-headphones-0';
        await saveWishlist(db, 'sale-user', 'prod-classic-cotton-tee');
        const favorite = (await readWishlist(db, 'sale-user'))[0];
        assert.equal(favorite.variants.find((v) => v.id === tee).size, 'L');
        assert.equal(favorite.variants.find((v) => v.id === tee).compareAtMinor, 79900);
        await writeCart(db, 'sale-user', tee, 2);
        await writeCart(db, 'sale-user', headphones, 1);
        const cart = await readCart(db, 'sale-user');
        assert.equal(cart.subtotalMinor, 419700);
        assert.equal(cart.items.find((i) => i.variantId === tee).label, 'L');
        const quote = await createQuote(db, 'sale-user', 'sale-address', cart.version);
        assert.equal(quote.subtotalMinor, 419700);
        assert.equal(quote.totalMinor, 440685);
        const key = crypto.randomUUID(),
          input = { quoteId: quote.id, simulation: 'success' };
        // Deterministic interleaving: the losing request reads no key, then the
        // winner commits before the loser reads the consumed quote. Both reads
        // and the winning checkout use real D1, with no timer-dependent race.
        const primary = db.withSession('first-primary');
        let holdFirstLookup = true,
          winner;
        const racingDB = {
          withSession: () => ({
            prepare(sql) {
              const statement = primary.prepare(sql);
              if (!sql.startsWith('SELECT request_hash AS requestHash')) return statement;
              return {
                bind(...values) {
                  const bound = statement.bind(...values);
                  return {
                    async first() {
                      const snapshot = await bound.first();
                      if (holdFirstLookup) {
                        holdFirstLookup = false;
                        winner = await placeOrder(db, 'sale-user', key, input, 'sale-winner');
                      }
                      return snapshot;
                    },
                  };
                },
              };
            },
            batch: (...args) => primary.batch(...args),
          }),
        };
        const delayed = await placeOrder(racingDB, 'sale-user', key, input, 'sale-delayed');
        assert.equal(delayed.replayed, true);
        assert.equal(delayed.order.id, winner.order.id);
        const result = winner;
        assert.equal(result.order.subtotalMinor, 419700);
        assert.equal(result.order.items.find((i) => i.variantId === tee).unitPriceMinor, 59900);
        assert.equal(result.order.items.find((i) => i.variantId === tee).variantLabel, 'L');
        assert.equal((await placeOrder(db, 'sale-user', key, input, 'sale-retry')).replayed, true);
        assert.equal((await readCart(db, 'sale-user')).itemCount, 0);
        // Later price changes cannot alter the historical discounted order.
        await db
          .prepare('UPDATE product_variants SET price_minor=price_minor+100 WHERE id=?')
          .bind(tee)
          .run();
        assert.equal(
          (
            await db
              .prepare('SELECT unit_price_minor AS price FROM order_items WHERE variant_id=?')
              .bind(tee)
              .first()
          ).price,
          59900,
        );
      },
    );
    await suite.test(
      'admin comparison-price edits are versioned and audited without changing inventory',
      async () => {
        await db
          .prepare(
            "INSERT INTO users(id,email,name,password_hash,role) VALUES('price-admin','price-admin@example.test','Price Admin','test-only','admin')",
          )
          .run();
        const variant = expandedProducts[0].variants[0],
          id = variant.id;
        const body = {
          sku: id.toUpperCase(),
          label: variant.label,
          color: variant.color,
          size: variant.size,
          priceMinor: 49900,
          compareAtMinor: 79900,
          image: variant.image,
          detailImage: variant.detailImage,
          active: true,
          position: 0,
        };
        const actor = { actorId: 'price-admin', requestId: 'sale-admin-edit' };
        assert.deepEqual(await updateVariant(db, id, 0, body, actor), { version: 1 });
        assert.deepEqual(
          await db
            .prepare(
              'SELECT price_minor,compare_at_minor,stock,version FROM product_variants WHERE id=?',
            )
            .bind(id)
            .first(),
          { price_minor: 49900, compare_at_minor: 79900, stock: 10, version: 1 },
        );
        await assert.rejects(
          updateVariant(db, id, 0, { ...body, compareAtMinor: null }, actor),
          (error) => error.code === 'STALE_CATALOG_VERSION',
        );
        await assert.rejects(
          updateVariant(db, id, 1, { ...body, compareAtMinor: 100 }, actor),
          (error) => error.code === 'INVALID_CATALOG_INPUT',
        );
        assert.equal(
          (
            await db
              .prepare(
                "SELECT count(*) AS n FROM audit_logs WHERE actor_id='price-admin' AND action='VARIANT_UPDATED'",
              )
              .first()
          ).n,
          1,
        );
        assert.deepEqual(await updateVariant(db, id, 1, { ...body, compareAtMinor: null }, actor), {
          version: 2,
        });
        assert.equal(
          (
            await db
              .prepare('SELECT compare_at_minor FROM product_variants WHERE id=?')
              .bind(id)
              .first()
          ).compare_at_minor,
          null,
        );
      },
    );
  } finally {
    await mf.dispose();
  }
});
