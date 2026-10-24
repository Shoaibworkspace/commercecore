// Local-only preservation check for additive catalog imports. No credentials are read.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const snapshotPath = '.wrangler/catalog-before-expansion.json';
const queries = {
  products:
    'SELECT id,category_id,slug,name,description,subtitle,material,dimensions,care,featured,is_new,archived,version FROM products ORDER BY id',
  variants:
    'SELECT id,product_id,sku,label,size,price_minor,compare_at_minor,stock,active,version,image_path,detail_image_path FROM product_variants ORDER BY id',
  orders: 'SELECT id,user_id,status,total_minor,stock_restored_at,version FROM orders ORDER BY id',
  roles: 'SELECT id,role FROM users ORDER BY id',
};
function query(sql) {
  const result = spawnSync(
    process.execPath,
    [
      'node_modules/wrangler/bin/wrangler.js',
      'd1',
      'execute',
      'commercecore-db',
      '--local',
      '--json',
      '--command',
      sql,
    ],
    { encoding: 'utf8', windowsHide: true },
  );
  if (result.status !== 0) throw new Error('Local preservation query failed; no data was changed.');
  return JSON.parse(result.stdout)[0].results;
}
if (process.argv.includes('--capture')) {
  const snapshot = Object.fromEntries(
    Object.entries(queries).map(([name, sql]) => [name, query(sql)]),
  );
  writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2) + '\n');
  console.log(
    'Saved local preservation snapshot (product metadata, prices/stock, order summaries and roles only).',
  );
} else if (process.argv.includes('--verify')) {
  const before = JSON.parse(readFileSync(snapshotPath, 'utf8'));
  for (const [name, sql] of Object.entries(queries)) {
    const current = new Map(query(sql).map((row) => [row.id, row]));
    for (const row of before[name])
      assert.deepEqual(current.get(row.id), row, `Existing ${name} row changed: ${row.id}`);
  }
  console.log(
    'Verified: all original products, variants, prices, inventory, orders and user roles are intact.',
  );
} else
  throw new Error('Use --capture before an import, or --verify afterwards. Local database only.');
