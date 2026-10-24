import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { productListSchema, categoryListSchema } from '../shared/catalog.ts';
import { sessionSchema } from '../shared/account.ts';

const config = JSON.parse(
  readFileSync(new URL('../wrangler.production.jsonc', import.meta.url), 'utf8'),
);
const origin = config.vars.APP_ORIGIN;
assert.equal(new URL(origin).origin, origin);
assert.equal(new URL(origin).protocol, 'https:');
const checks = [];
const requests = [];
async function check(name, action) {
  try {
    await action();
    checks.push({ name, passed: true });
  } catch {
    checks.push({ name, passed: false });
  }
}
async function request(path, options = {}) {
  const readOnly = !options.method || ['GET', 'HEAD'].includes(options.method);
  for (let attempt = 1; attempt <= (readOnly ? 2 : 1); attempt++) {
    try {
      const response = await fetch(origin + path, {
        redirect: 'error',
        signal: AbortSignal.timeout(20000),
        ...options,
      });
      requests.push({ path, attempt, status: response.status });
      return response;
    } catch (error) {
      requests.push({
        path,
        attempt,
        failure: error instanceof Error ? error.name : 'UnknownError',
        cause: error?.cause?.code,
      });
      if (!readOnly || attempt === 2) throw error;
    }
  }
}
async function json(path) {
  const response = await request(path);
  assert.equal(response.status, 200);
  return response.json();
}
await check('health, demo payments and security headers', async () => {
  const response = await request('/api/health');
  assert.equal(response.status, 200);
  assert.equal((await response.json()).data.paymentMode, 'demo');
  assert.match(response.headers.get('strict-transport-security') ?? '', /max-age=/);
  assert.ok(response.headers.get('content-security-policy'));
  assert.match(response.headers.get('cache-control') ?? '', /no-store/);
});
await check('database ready including provider identity mapping', async () => {
  assert.equal((await json('/api/ready')).data.status, 'ready');
});
await check('100-product paged catalog and seven categories', async () => {
  const catalog = productListSchema.parse(await json('/api/products?pageSize=12'));
  assert.equal(catalog.meta.total, 100);
  assert.equal(catalog.data.length, 12);
  assert.equal(categoryListSchema.parse(await json('/api/categories')).data.length, 7);
  const response = await request(catalog.data[0].gallery[0].image, { method: 'HEAD' });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') ?? '', /image\/webp/);
});
await check('clothing and sale filtering', async () => {
  assert.equal(
    productListSchema.parse(await json('/api/products?category=clothing')).meta.total,
    24,
  );
  const sales = productListSchema.parse(await json('/api/products?sale=1'));
  assert.ok(sales.meta.total > 0);
  assert.ok(
    sales.data.every((product) =>
      product.variants.some((variant) => variant.compareAtMinor > variant.priceMinor),
    ),
  );
});
await check('anonymous Supabase bootstrap and secure preauth cookie', async () => {
  const response = await request('/api/auth/session');
  assert.equal(response.status, 200);
  const session = sessionSchema.parse(await response.json());
  assert.equal(session.data.user, null);
  assert.equal(session.data.authProvider, 'supabase');
  const cookie = response.headers.get('set-cookie') ?? '';
  assert.match(cookie, /__Host-cc_preauth=/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /HttpOnly/);
  assert.doesNotMatch(cookie, /Domain=/i);
});
await check('anonymous cart and admin access denied', async () => {
  assert.equal((await request('/api/cart')).status, 401);
  assert.equal((await request('/api/admin/status')).status, 401);
});
await check('login rejects missing Origin and CSRF before authentication', async () => {
  assert.equal(
    (
      await request('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      })
    ).status,
    403,
  );
});
await check('product deep links return the storefront', async () => {
  const response = await request('/products/classic-cotton-tee?variant=var-classic-cotton-tee-2');
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') ?? '', /text\/html/);
});
const report = {
  origin,
  recordedAt: new Date().toISOString(),
  passed: checks.every((check) => check.passed),
  checks,
  requests,
  remaining:
    'Human email confirmation, successful login/recovery, authenticated demo checkout and explicit hosted admin acceptance are separate live checks.',
};
writeFileSync(
  new URL('../docs/hosted-verification.json', import.meta.url),
  JSON.stringify(report, null, 2) + '\n',
);
console.log(JSON.stringify(report, null, 2));
if (!report.passed) process.exitCode = 1;
