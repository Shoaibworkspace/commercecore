import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Miniflare } from 'miniflare';

// This migration has no triggers or semicolons within literals. Keep each
// prepared statement intact; D1 exec's newline splitting is unsuitable for it.
function statements(path) {
  return readFileSync(new URL(path, import.meta.url), 'utf8')
    .replace(/--[^\n]*/g, '')
    .split(';')
    .map((sql) => sql.trim())
    .filter(Boolean);
}

test('real local D1 applies migration, seed, and rolls back a failed batch', async () => {
  const config = JSON.parse(readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8'));
  const mf = new Miniflare({
    modules: true,
    script: 'export default {fetch() {return new Response("test");}}',
    d1Databases: ['DB'],
    compatibilityDate: config.compatibility_date,
  });
  try {
    const db = await mf.getD1Database('DB');
    await db.batch(
      statements('../backend/db/migrations/0001_initial.sql').map((sql) => db.prepare(sql)),
    );
    await db.batch(statements('../backend/db/seed/catalog.sql').map((sql) => db.prepare(sql)));
    assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM products').first()).n, 3);
    await assert.rejects(
      db.batch([
        db.prepare("UPDATE product_variants SET stock = stock - 1 WHERE id = 'var-lamp-sage'"),
        db.prepare("UPDATE product_variants SET stock = stock - 5 WHERE id = 'var-cup-sand'"),
      ]),
    );
    assert.equal(
      (await db.prepare("SELECT stock FROM product_variants WHERE id = 'var-lamp-sage'").first())
        .stock,
      12,
    );
    assert.equal(
      (await db.prepare("SELECT stock FROM product_variants WHERE id = 'var-cup-sand'").first())
        .stock,
      4,
    );
  } finally {
    await mf.dispose();
  }
});
