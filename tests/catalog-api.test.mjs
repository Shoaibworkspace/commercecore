import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { Miniflare } from 'miniflare';
import { app } from '../backend/src/app.ts';
import { applySQL } from './helpers/sql.mjs';
import { productListSchema, productDetailSchema, categoryListSchema } from '../shared/catalog.ts';
import {
  createProduct,
  updateProduct,
  archiveProduct,
  createCategory,
  updateCategory,
  createVariant,
  updateVariant,
  setProductImage,
} from '../backend/src/services/catalog-management.ts';
import { ServiceError } from '../backend/src/services/errors.ts';

const path = '/images/photos/lamp-main.webp';
const metadata = {
  categoryId: 'cat-workspace',
  slug: 'integration-lamp',
  name: 'Integration Lamp',
  description: 'Test object',
  subtitle: 'Test subtitle',
  material: 'Metal',
  dimensions: '20 cm',
  care: 'Dry cloth',
  featured: true,
  isNew: false,
};
const variant = {
  sku: 'TEST-LAMP',
  label: 'Sage',
  color: '#889988',
  priceMinor: 12345,
  image: path,
  detailImage: path,
  active: true,
  position: 0,
};
const input = () => ({
  ...metadata,
  variants: [{ ...variant }],
  gallery: [{ image: path, alt: 'Integration lamp' }],
});
const rejectsCode = (promise, code) =>
  assert.rejects(promise, (error) => error instanceof ServiceError && error.code === code);

test('D1-backed catalog and internal management integration', async (suite) => {
  const config = JSON.parse(readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8'));
  const mf = new Miniflare({
    modules: true,
    script: 'export default {fetch() {return new Response("test");}}',
    d1Databases: ['DB'],
    compatibilityDate: config.compatibility_date,
  });
  try {
    const db = await mf.getD1Database('DB');
    await applySQL(db, 'backend/db/migrations/0001_initial.sql');
    // Exercise upgrading an existing Phase 1 seed, not just an empty database.
    await applySQL(db, 'backend/db/seed/catalog.sql');
    await applySQL(db, 'backend/db/migrations/0002_catalog.sql');
    await applySQL(db, 'backend/db/migrations/0009_catalog_sale_prices.sql');
    await applySQL(db, 'backend/db/seed/storefront.sql');
    const env = { DB: db, APP_ENV: 'development', PAYMENT_MODE: 'demo' };
    const get = (url, options = {}) => app.request(`/api${url}`, options, env);
    const list = async (query = '') => {
      const response = await get(`/products?${query}`);
      assert.equal(response.status, 200, await response.clone().text());
      return productListSchema.parse(await response.json());
    };

    await suite.test(
      'upgrade retains legacy IDs and initializes 12 products, 24 variants and matching inventory ledger',
      async () => {
        assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM products').first()).n, 12);
        assert.equal(
          (await db.prepare('SELECT COUNT(*) AS n FROM product_variants').first()).n,
          24,
        );
        assert.equal(
          (await db.prepare("SELECT id FROM products WHERE slug='daily-canvas-tote'").first()).id,
          'prod-bag',
        );
        assert.equal(
          (await db.prepare("SELECT stock FROM product_variants WHERE id='var-cup-sand'").first())
            .stock,
          4,
        );
        assert.equal(
          (
            await db
              .prepare(
                `SELECT COUNT(*) AS n FROM product_variants v WHERE v.stock != COALESCE((SELECT SUM(quantity_delta) FROM inventory_movements WHERE variant_id=v.id),0)`,
              )
              .first()
          ).n,
          0,
        );
        assert.deepEqual((await db.prepare('PRAGMA foreign_key_check').all()).results, []);
      },
    );
    await suite.test(
      'categories, paginated products and detail return validated contracts with local photo assets',
      async () => {
        const response = await get('/categories');
        assert.equal(response.status, 200);
        assert.equal(categoryListSchema.parse(await response.json()).data.length, 3);
        const products = await list();
        assert.deepEqual(products.meta, { page: 1, pageSize: 6, total: 12, totalPages: 2 });
        assert.equal(products.data.length, 6);
        assert.equal(response.headers.get('cache-control'), 'no-store');
        const detailResponse = await get('/products/arc-desk-lamp');
        const detail = productDetailSchema.parse(await detailResponse.json());
        assert.equal(detail.data.product.variants[0].id, 'var-lamp-sage');
        assert.equal(detail.data.related.length, 3);
        assert.ok(
          detail.data.related.every(
            (item) => item.category === 'workspace' && item.id !== 'prod-lamp',
          ),
        );
        for (const product of (await list('pageSize=24')).data) {
          for (const image of [
            ...product.variants.flatMap((v) => [v.image, v.detailImage]),
            ...product.gallery.map((i) => i.image),
          ]) {
            assert.ok(existsSync(new URL(`../frontend/public${image}`, import.meta.url)), image);
          }
        }
      },
    );
    await suite.test(
      'server search handles mixed case, material and malicious text literally',
      async () => {
        assert.equal((await list('q=ARC')).data[0].slug, 'arc-desk-lamp');
        assert.equal((await list('q=stoneware')).meta.total, 2);
        const percent = await list('q=%25');
        assert.equal(percent.meta.total, 1); // The tote's material literally contains "100%".
        assert.equal(percent.data[0].slug, 'daily-canvas-tote');
        for (const q of ['_', "' OR 1=1 --", '<script>', '桌子'])
          assert.equal((await list(`q=${encodeURIComponent(q)}`)).meta.total, 0, q);
      },
    );
    await suite.test(
      'server category/price/stock filters compose and prices must match a real variant',
      async () => {
        const products = await list('category=home&minPrice=70000&maxPrice=120000&stock=1');
        assert.deepEqual(products.data.map((p) => p.slug).sort(), [
          'gather-wooden-tray',
          'studio-ceramic-cup',
        ]);
        assert.equal((await list('category=home&minPrice=220000&maxPrice=230000')).meta.total, 0);
        assert.equal(
          (await list('category=home&minPrice=240000&maxPrice=250000')).data[0].slug,
          'woven-cotton-throw',
        );
        assert.equal((await list('stock=1')).meta.total, 11);
        assert.equal((await list('category=not-existing')).meta.total, 0);
      },
    );
    await suite.test(
      'price and stock predicate is applied to the same active variant',
      async () => {
        await db.batch([
          db.prepare(
            "UPDATE product_variants SET price_minor=10000,stock=0 WHERE id='var-lamp-sage'",
          ),
          db.prepare("UPDATE product_variants SET price_minor=20000 WHERE id='var-lamp-ink'"),
        ]);
        try {
          assert.equal((await list('q=Arc&maxPrice=15000&stock=1')).meta.total, 0);
        } finally {
          await db.batch([
            db.prepare(
              "UPDATE product_variants SET price_minor=249900,stock=12 WHERE id='var-lamp-sage'",
            ),
            db.prepare("UPDATE product_variants SET price_minor=249900 WHERE id='var-lamp-ink'"),
          ]);
        }
      },
    );
    await suite.test(
      'stable sorting, disjoint pages, large-page clamping and empty page metadata',
      async () => {
        const a = await list('sort=price-asc&pageSize=24');
        const prices = a.data.map((p) => Math.min(...p.variants.map((v) => v.priceMinor)));
        assert.deepEqual(
          prices,
          [...prices].sort((a, b) => a - b),
        );
        const descending = await list('sort=price-desc&pageSize=24');
        assert.equal(descending.data[0].slug, 'form-desktop-speaker');
        const first = await list(),
          second = await list('page=2');
        assert.ok(second.data.every((p) => !first.data.some((item) => item.id === p.id)));
        assert.equal((await list('page=10000')).meta.page, 2);
        assert.deepEqual((await list('q=missing-object&page=10000')).meta, {
          page: 1,
          pageSize: 6,
          total: 0,
          totalPages: 1,
        });
        assert.ok((await list('featured=1')).data.every((p) => p.featured));
        assert.ok((await list('new=1&sort=newest')).data.every((p) => p.isNew));
      },
    );
    await suite.test(
      'malformed, oversized, repeated and unknown query parameters return safe 400',
      async () => {
        for (const query of [
          'page=0',
          'page=-1',
          'page=10001',
          'pageSize=25',
          'pageSize=0',
          'minPrice=12.5',
          'maxPrice=100000001',
          'minPrice=900&maxPrice=100',
          'stock=yes',
          'sort=name;DROP TABLE products',
          'page=1&page=2',
          'extra=1',
          `q=${'a'.repeat(101)}`,
          'category=../home',
        ]) {
          const response = await get(`/products?${query}`);
          assert.equal(response.status, 400, query);
          const body = await response.json();
          assert.equal(body.error.code, 'INVALID_QUERY');
          assert.equal(response.headers.get('x-request-id'), body.requestId);
        }
      },
    );
    await suite.test(
      'missing products return JSON 404 and no admin verb can mutate the catalog',
      async () => {
        assert.equal((await get('/products/missing-product')).status, 404);
        assert.equal((await get('/products/INVALID')).status, 404);
        for (const method of ['GET', 'POST', 'PATCH', 'DELETE']) {
          const response = await get('/admin/products', {
            method,
            headers: { 'content-type': 'application/json', 'x-role': 'admin' },
            body: method === 'GET' ? undefined : JSON.stringify(input()),
          });
          assert.equal(response.status, 401);
        }
        assert.equal((await list()).meta.total, 12);
      },
    );
    await suite.test(
      'repeat seed preserves product/category edits, archive flags, stock, prices and ledger',
      async () => {
        await db
          .prepare(
            "UPDATE products SET name='Edited notebook',subtitle='Edited',version=1,archived=1 WHERE id='prod-notebook'",
          )
          .run();
        await db
          .prepare(
            "UPDATE product_variants SET stock=2,price_minor=54321,version=1 WHERE id='var-notebook-main'",
          )
          .run();
        await db
          .prepare(
            "UPDATE categories SET name='Edited workspace',version=1 WHERE id='cat-workspace'",
          )
          .run();
        const before = (await db.prepare('SELECT COUNT(*) AS n FROM inventory_movements').first())
          .n;
        await applySQL(db, 'backend/db/seed/catalog.sql');
        await applySQL(db, 'backend/db/seed/storefront.sql');
        const row = await db
          .prepare("SELECT name,subtitle,archived FROM products WHERE id='prod-notebook'")
          .first();
        assert.deepEqual(row, { name: 'Edited notebook', subtitle: 'Edited', archived: 1 });
        assert.deepEqual(
          await db
            .prepare("SELECT stock,price_minor FROM product_variants WHERE id='var-notebook-main'")
            .first(),
          { stock: 2, price_minor: 54321 },
        );
        assert.equal(
          (await db.prepare('SELECT COUNT(*) AS n FROM inventory_movements').first()).n,
          before,
        );
        assert.equal((await get('/products/field-notebook')).status, 404);
        await db.prepare("UPDATE products SET archived=0 WHERE id='prod-notebook'").run();
      },
    );
    await suite.test(
      'internal product create saves variants and gallery atomically with zero initial stock',
      async () => {
        const saved = await createProduct(db, input());
        const response = await get('/products/integration-lamp');
        assert.equal(response.status, 200);
        const detail = productDetailSchema.parse(await response.json()).data.product;
        assert.equal(detail.id, saved.id);
        assert.equal(detail.variants[0].priceMinor, 12345);
        assert.equal(detail.variants[0].stock, 0);
      },
    );
    await suite.test('duplicate variant SKU rolls back the whole product creation', async () => {
      const bad = input();
      bad.slug = 'must-rollback';
      bad.variants = [
        { ...variant, sku: 'ROLLBACK', label: 'A' },
        { ...variant, sku: 'ROLLBACK', label: 'B' },
      ];
      await rejectsCode(createProduct(db, bad), 'CATALOG_CONFLICT');
      assert.equal(
        (await db.prepare("SELECT COUNT(*) AS n FROM products WHERE slug='must-rollback'").first())
          .n,
        0,
      );
      assert.equal(
        (
          await db
            .prepare("SELECT COUNT(*) AS n FROM product_variants WHERE sku='ROLLBACK'")
            .first()
        ).n,
        0,
      );
    });
    await suite.test(
      'invalid category creation reference rolls back; metadata and money/image fields are strictly validated',
      async () => {
        await rejectsCode(
          createProduct(db, { ...input(), slug: 'invalid-category', categoryId: 'missing' }),
          'INVALID_REFERENCE',
        );
        for (const change of [
          { priceMinor: 12.5 },
          { priceMinor: -1 },
          { priceMinor: 100000001 },
          { stock: 999 },
          { image: 'https://evil.test/a.jpg' },
          { image: '/images/../secret.svg' },
          { color: 'url(javascript:alert(1))' },
        ]) {
          const bad = input();
          bad.variants = [{ ...variant, ...change }];
          await rejectsCode(createProduct(db, bad), 'INVALID_CATALOG_INPUT');
        }
        await rejectsCode(
          createProduct(db, { ...input(), role: 'admin' }),
          'INVALID_CATALOG_INPUT',
        );
      },
    );
    await suite.test(
      'product metadata updates and archive/unarchive use optimistic versions',
      async () => {
        const row = await db
          .prepare("SELECT id FROM products WHERE slug='integration-lamp'")
          .first();
        assert.deepEqual(
          await updateProduct(db, row.id, 0, { ...metadata, name: 'Changed Lamp' }),
          { version: 1 },
        );
        await rejectsCode(
          updateProduct(db, row.id, 0, { ...metadata, name: 'Stale Lamp' }),
          'STALE_CATALOG_VERSION',
        );
        assert.equal((await get('/products/integration-lamp')).status, 200);
        assert.deepEqual(await archiveProduct(db, row.id, 1), { version: 2 });
        assert.equal((await get('/products/integration-lamp')).status, 404);
        await archiveProduct(db, row.id, 2, false);
        assert.equal((await get('/products/integration-lamp')).status, 200);
      },
    );
    await suite.test(
      'variant price/photo updates retain stock and reject stale writes or inventory injection',
      async () => {
        const row = await db
          .prepare("SELECT id FROM product_variants WHERE sku='TEST-LAMP'")
          .first();
        assert.deepEqual(
          await updateVariant(db, row.id, 0, {
            ...variant,
            priceMinor: 79951,
            image: '/images/photos/lamp-alt.webp',
          }),
          { version: 1 },
        );
        await rejectsCode(updateVariant(db, row.id, 0, variant), 'STALE_CATALOG_VERSION');
        await rejectsCode(
          updateVariant(db, row.id, 1, { ...variant, stock: 10 }),
          'INVALID_CATALOG_INPUT',
        );
        const detail = productDetailSchema.parse(
          await (await get('/products/integration-lamp')).json(),
        ).data.product;
        assert.equal(detail.variants[0].priceMinor, 79951);
        assert.equal(detail.variants[0].stock, 0);
        assert.equal(detail.variants[0].image, '/images/photos/lamp-alt.webp');
        await updateVariant(db, row.id, 1, { ...variant, active: false });
        assert.equal((await get('/products/integration-lamp')).status, 404);
        await updateVariant(db, row.id, 2, variant);
      },
    );
    await suite.test(
      'category management, variant creation and image updates feed actual API data',
      async () => {
        const category = await createCategory(db, {
          slug: 'accessories',
          name: 'Accessories',
          description: 'Test category',
          image: path,
        });
        await updateCategory(db, category.id, 0, {
          slug: 'accessories',
          name: 'New Accessories',
          description: 'Edited',
          image: path,
        });
        await rejectsCode(
          updateCategory(db, category.id, 0, {
            slug: 'accessories',
            name: 'Stale',
            description: '',
            image: path,
          }),
          'STALE_CATALOG_VERSION',
        );
        await rejectsCode(
          createCategory(db, {
            slug: 'accessories',
            name: 'Duplicate',
            description: '',
            image: path,
          }),
          'CATALOG_CONFLICT',
        );
        const product = await db
          .prepare("SELECT id FROM products WHERE slug='integration-lamp'")
          .first();
        await createVariant(db, product.id, {
          ...variant,
          sku: 'TEST-INK',
          label: 'Ink',
          position: 1,
        });
        await setProductImage(db, product.id, 2, {
          image: '/images/photos/lamp-alt.webp',
          alt: 'Side view',
        });
        const detail = productDetailSchema.parse(
          await (await get('/products/integration-lamp')).json(),
        ).data.product;
        assert.equal(detail.variants.length, 2);
        assert.equal(detail.gallery.length, 2);
        assert.equal(detail.gallery[1].alt, 'Side view');
        assert.ok(
          categoryListSchema
            .parse(await (await get('/categories')).json())
            .data.some((c) => c.name === 'New Accessories'),
        );
      },
    );
    await suite.test(
      'database/schema failure returns 503 without SQL or provider internals',
      async () => {
        const response = await app.request(
          '/api/products',
          {},
          {
            DB: {
              prepare() {
                throw new Error('secret SQL internals');
              },
            },
          },
        );
        assert.equal(response.status, 503);
        assert.equal((await response.clone().json()).error.code, 'CATALOG_UNAVAILABLE');
        assert.doesNotMatch(await response.text(), /secret SQL/);
      },
    );
    await suite.test(
      'concurrent metadata writes with the same version allow exactly one winner',
      async () => {
        const saved = await createProduct(db, {
          ...input(),
          slug: 'concurrent-record',
          variants: [{ ...variant, sku: 'CONCURRENT' }],
        });
        const results = await Promise.allSettled([
          updateProduct(db, saved.id, 0, {
            ...metadata,
            slug: 'concurrent-record',
            name: 'First edit',
          }),
          updateProduct(db, saved.id, 0, {
            ...metadata,
            slug: 'concurrent-record',
            name: 'Second edit',
          }),
        ]);
        assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
        assert.equal(
          results.filter(
            (r) => r.status === 'rejected' && r.reason.code === 'STALE_CATALOG_VERSION',
          ).length,
          1,
        );
        assert.equal(
          (await db.prepare('SELECT version FROM products WHERE id=?').bind(saved.id).first())
            .version,
          1,
        );
      },
    );
    await suite.test(
      'management bounds variant growth and gallery positions; price cap remains a valid read filter',
      async () => {
        const saved = await createProduct(db, {
          ...input(),
          slug: 'bounded-product',
          variants: Array.from({ length: 20 }, (_, i) => ({
            ...variant,
            sku: `BOUND-${i}`,
            label: `Finish ${i}`,
            position: i,
          })),
        });
        await rejectsCode(
          createVariant(db, saved.id, { ...variant, sku: 'BOUND-21' }),
          'VARIANT_LIMIT',
        );
        await rejectsCode(
          setProductImage(db, saved.id, 12, { image: path, alt: 'Too many images' }),
          'INVALID_CATALOG_INPUT',
        );
        const detail = productDetailSchema.parse(
          await (await get('/products/bounded-product')).json(),
        ).data.product;
        assert.equal(detail.variants.length, 20);
        assert.equal((await list('minPrice=100000000')).meta.total, 0);
      },
    );
  } finally {
    await mf.dispose();
  }
});
