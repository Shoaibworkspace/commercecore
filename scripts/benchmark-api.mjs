import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { cpus, platform, arch } from 'node:os';
import { randomBytes } from 'node:crypto';
import { Miniflare } from 'miniflare';
import { applySQL } from '../tests/helpers/sql.mjs';
import { hmac, sha256 } from '../worker/services/crypto.ts';
import { listProducts } from '../worker/repositories/catalog.ts';
import { catalogQuerySchema } from '../worker/validators/catalog.ts';
const config = JSON.parse(readFileSync('wrangler.jsonc', 'utf8'));
const secret = randomBytes(32).toString('hex'),
  token = randomBytes(32).toString('hex'),
  hash = await sha256(token),
  csrf = await hmac(secret, `session-csrf:v1:${hash}`);
const mf = new Miniflare({
  modules: true,
  scriptPath: '.worker-build/index.js',
  compatibilityDate: config.compatibility_date,
  compatibilityFlags: config.compatibility_flags,
  d1Databases: ['DB'],
  bindings: { APP_ENV: 'development', PAYMENT_MODE: 'demo', AUTH_SECRET: secret },
});
const results = [];
const queryPlans = [];
const delivery = JSON.stringify({
  recipient: 'Sample Recipient',
  line1: '12 Sample Lane',
  line2: '',
  city: 'Demo City',
  region: 'Demo State',
  postalCode: '110001',
  countryCode: 'IN',
  phone: '5551234567',
});
try {
  const db = await mf.getD1Database('DB');
  for (const file of readdirSync('db/migrations')
    .filter((f) => f.endsWith('.sql'))
    .sort())
    await applySQL(db, `db/migrations/${file}`);
  await applySQL(db, 'db/seed/catalog.sql');
  await applySQL(db, 'db/seed/storefront.sql');
  const time = Math.floor(Date.now() / 1000);
  await db
    .prepare(
      "INSERT INTO users(id,email,name,password_hash,role) VALUES('benchmark-admin','benchmark@example.test','Local benchmark','test-only','admin')",
    )
    .run();
  await db
    .prepare(
      'INSERT INTO sessions(token_hash,user_id,csrf_token_hash,expires_at,created_at,last_seen_at) VALUES(?,?,?,?,?,?)',
    )
    .bind(hash, 'benchmark-admin', await sha256(csrf), time + 86400, time, time)
    .run();
  async function measure(scenario, path) {
    const timings = [];
    let bytes = 0,
      coldMs;
    for (let i = -3; i < 20; i++) {
      const start = performance.now(),
        response = await mf.dispatchFetch(`http://localhost${path}`, {
          headers: { cookie: `cc_session=${token}` },
        }),
        body = await response.text(),
        elapsed = performance.now() - start;
      if (response.status !== 200)
        throw new Error(`${path}: ${response.status} ${body.slice(0, 150)}`);
      if (body.length > 150000) throw new Error(`${path}: unexpected unbounded response`);
      if (i === -3) coldMs = Number(elapsed.toFixed(2));
      if (i >= 0) timings.push(elapsed);
      bytes = Buffer.byteLength(body);
    }
    timings.sort((a, b) => a - b);
    const value = {
      scenario,
      path,
      samples: timings.length,
      firstRequestWallMs: coldMs,
      p50WallMs: Number(timings[Math.ceil(timings.length * 0.5) - 1].toFixed(2)),
      p95WallMs: Number(timings[Math.ceil(timings.length * 0.95) - 1].toFixed(2)),
      maxWallMs: Number(timings.at(-1).toFixed(2)),
      responseBytes: bytes,
    };
    results.push(value);
    console.log(JSON.stringify(value));
  }
  for (const scenario of ['seed-12-products', 'synthetic-1012-products-1000-orders']) {
    if (scenario.startsWith('synthetic')) {
      await db.batch([
        db.prepare(`WITH RECURSIVE n(x) AS(VALUES(1) UNION ALL SELECT x+1 FROM n WHERE x<1000)
          INSERT INTO products(id,category_id,slug,name,description,material) SELECT 'bench-p-'||x,'cat-everyday','benchmark-item-'||x,printf('Benchmark item %04d',x),'Synthetic benchmark fixture','Canvas' FROM n`),
        db.prepare(
          `INSERT INTO product_variants(id,product_id,sku,label,price_minor,stock,swatch) SELECT 'bench-v-'||id,id,'BENCH-'||id,'Natural',100000,10,'#819379' FROM products WHERE id LIKE 'bench-p-%'`,
        ),
        db.prepare(
          `INSERT INTO product_images(id,product_id,path,alt,position) SELECT 'bench-img-'||id,id,'/images/product-placeholder.svg','Synthetic product',0 FROM products WHERE id LIKE 'bench-p-%'`,
        ),
        db
          .prepare(
            `WITH RECURSIVE n(x) AS(VALUES(1) UNION ALL SELECT x+1 FROM n WHERE x<1000)
          INSERT INTO orders(id,order_number,user_id,status,payment_status,subtotal_minor,shipping_minor,tax_minor,total_minor,delivery_json,created_at)
          SELECT 'bench-o-'||x,'CC-BENCH-'||x,'benchmark-admin',CASE WHEN x%5=0 THEN 'DELIVERED' ELSE 'CONFIRMED' END,'SIMULATED_SUCCESS',129900,7900,6495,144295,?,unixepoch()-x*1800 FROM n`,
          )
          .bind(delivery),
        db.prepare(`INSERT INTO order_items(id,order_id,variant_id,product_name,variant_label,sku,quantity,unit_price_minor,line_total_minor,image_path)
          SELECT 'bench-item-'||id,id,'var-bag-natural','Daily Canvas Tote','Natural','TOTE-NAT',1,129900,129900,'/images/photos/tote-main.webp' FROM orders WHERE id LIKE 'bench-o-%'`),
      ]);
    }
    let captured;
    await listProducts(
      {
        prepare(sql) {
          return {
            bind(...values) {
              captured = { sql, values };
              return db.prepare(sql).bind(...values);
            },
          };
        },
      },
      catalogQuerySchema.parse({ q: 'canvas', stock: '1', sort: 'price-asc', pageSize: '12' }),
    );
    queryPlans.push({
      scenario,
      case: 'stock-and-price',
      steps: (
        await db
          .prepare('EXPLAIN QUERY PLAN ' + captured.sql)
          .bind(...captured.values)
          .all()
      ).results.map((row) => row.detail),
    });
    for (const path of [
      '/api/health',
      '/api/products?page=1&pageSize=12',
      '/api/products?q=canvas&stock=1&sort=price-asc&pageSize=12',
      '/api/products/daily-canvas-tote',
      '/api/admin/analytics?days=30',
      '/api/orders?page=1',
    ])
      await measure(scenario, path);
  }
} finally {
  await mf.dispose();
}
const report = {
  measuredAtUTC: new Date().toISOString(),
  runtime: 'Built Worker ESM in local workerd / Miniflare with isolated D1',
  node: process.version,
  platform: platform(),
  arch: arch(),
  cpu: cpus()[0]?.model,
  conditions:
    'Sequential requests, first request reported separately, two warmups, 20 measured requests per case. Fictional fixtures; no network or real user database.',
  limitations:
    'Local wall time including serialization and D1. Not Worker CPU, browser LCP, cloud latency, throughput or supported-user evidence. A single fixed machine and small synthetic dataset do not establish Free-plan capacity.',
  results,
  queryPlans,
};
writeFileSync('docs/api-benchmark.json', JSON.stringify(report, null, 2) + '\n');
