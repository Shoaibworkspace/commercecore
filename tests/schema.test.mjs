import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const migration = readFileSync(
  new URL('../db/migrations/0001_initial.sql', import.meta.url),
  'utf8',
);
const seed = readFileSync(new URL('../db/seed/catalog.sql', import.meta.url), 'utf8');
function database() {
  const db = new DatabaseSync(':memory:');
  db.exec(migration);
  db.exec(seed);
  return db;
}
function withDatabase(run) {
  const db = database();
  try {
    run(db);
  } finally {
    db.close();
  }
}

test('migration creates all 16 required tables with valid foreign keys', () =>
  withDatabase((db) => {
    assert.equal(
      db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table'").get().n,
      16,
    );
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
    assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
  }));

test('seed is repeat-safe and preserves catalog edits and inventory', () =>
  withDatabase((db) => {
    db.exec(
      "UPDATE product_variants SET stock = 2, price_minor = 12345 WHERE id = 'var-lamp-sage'",
    );
    db.exec(seed);
    const row = db
      .prepare("SELECT stock, price_minor FROM product_variants WHERE id = 'var-lamp-sage'")
      .get();
    assert.equal(row.stock, 2);
    assert.equal(row.price_minor, 12345);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM inventory_movements').get().n, 4);
  }));

test('database rejects negative stock and fractional currency values', () =>
  withDatabase((db) => {
    assert.throws(
      () => db.exec("UPDATE product_variants SET stock = -1 WHERE id = 'var-lamp-sage'"),
      /CHECK/,
    );
    assert.throws(
      () => db.exec("UPDATE product_variants SET price_minor = 12.5 WHERE id = 'var-lamp-sage'"),
      /INTEGER/,
    );
    assert.throws(
      () => db.exec("UPDATE product_variants SET price_minor = -1 WHERE id = 'var-lamp-sage'"),
      /CHECK/,
    );
  }));

test('cart rejects missing variants, zero quantities, and duplicate lines', () =>
  withDatabase((db) => {
    db.exec(
      "INSERT INTO users (id,email,name,password_hash) VALUES ('u','test@example.com','Test','test-only-non-credential')",
    );
    db.exec("INSERT INTO carts (id,user_id) VALUES ('c','u')");
    assert.throws(
      () => db.exec("INSERT INTO cart_items VALUES ('c','missing',1,1,1)"),
      /FOREIGN KEY/,
    );
    assert.throws(
      () => db.exec("INSERT INTO cart_items VALUES ('c','var-lamp-sage',0,1,1)"),
      /CHECK/,
    );
    assert.throws(
      () => db.exec("INSERT INTO cart_items VALUES ('c','var-lamp-sage',21,1,1)"),
      /CHECK/,
    );
    db.exec("INSERT INTO cart_items VALUES ('c','var-lamp-sage',1,1,1)");
    assert.throws(
      () => db.exec("INSERT INTO cart_items VALUES ('c','var-lamp-sage',1,1,1)"),
      /UNIQUE/,
    );
  }));

test('users default to customer and email uniqueness is case-insensitive', () =>
  withDatabase((db) => {
    db.exec(
      "INSERT INTO users (id,email,name,password_hash) VALUES ('u','test@example.com','Test','test-only-non-credential')",
    );
    assert.equal(db.prepare("SELECT role FROM users WHERE id = 'u'").get().role, 'customer');
    assert.throws(
      () =>
        db.exec(
          "INSERT INTO users (id,email,name,password_hash) VALUES ('v','test@example.com','Test','test-only-non-credential')",
        ),
      /UNIQUE/,
    );
    assert.throws(() => db.exec("UPDATE users SET role = 'owner' WHERE id = 'u'"), /CHECK/);
  }));

test('SQLite transaction rolls back all stock changes after a constraint failure', () =>
  withDatabase((db) => {
    db.exec('BEGIN');
    try {
      db.exec("UPDATE product_variants SET stock = stock - 1 WHERE id = 'var-lamp-sage'");
      db.exec("UPDATE product_variants SET stock = stock - 5 WHERE id = 'var-cup-sand'");
      assert.fail('Expected stock constraint to fail');
    } catch (error) {
      db.exec('ROLLBACK');
      assert.match(error.message, /CHECK/);
    }
    assert.equal(
      db.prepare("SELECT stock FROM product_variants WHERE id = 'var-lamp-sage'").get().stock,
      12,
    );
    assert.equal(
      db.prepare("SELECT stock FROM product_variants WHERE id = 'var-cup-sand'").get().stock,
      4,
    );
  }));

test('orders enforce calculated totals and demo-only payment', () =>
  withDatabase((db) => {
    db.exec(
      "INSERT INTO users (id,email,name,password_hash) VALUES ('u','test@example.com','Test','test-only-non-credential')",
    );
    const insert = db.prepare(
      'INSERT INTO orders (id,order_number,user_id,payment_mode,payment_status,subtotal_minor,shipping_minor,tax_minor,total_minor,delivery_json) VALUES (?,?,?,?,?,?,?,?,?,?)',
    );
    assert.throws(
      () => insert.run('o', 'CC-1', 'u', 'demo', 'SIMULATED_SUCCESS', 100, 10, 5, 100, '{}'),
      /CHECK/,
    );
    assert.throws(
      () => insert.run('o', 'CC-1', 'u', 'live', 'SIMULATED_SUCCESS', 100, 10, 5, 115, '{}'),
      /CHECK/,
    );
    insert.run('o', 'CC-1', 'u', 'demo', 'SIMULATED_SUCCESS', 100, 10, 5, 115, '{}');
    assert.throws(() => db.exec("UPDATE orders SET status = 'UNKNOWN' WHERE id = 'o'"), /CHECK/);
  }));

test('historical price snapshots remain stable when catalog prices change', () =>
  withDatabase((db) => {
    db.exec(
      "INSERT INTO users (id,email,name,password_hash) VALUES ('u','test@example.com','Test','test-only-non-credential')",
    );
    db.exec(
      "INSERT INTO orders (id,order_number,user_id,payment_status,subtotal_minor,shipping_minor,tax_minor,total_minor,delivery_json) VALUES ('o','CC-1','u','SIMULATED_SUCCESS',249900,0,0,249900,'{}')",
    );
    db.exec(
      "INSERT INTO order_items (id,order_id,variant_id,product_name,variant_label,sku,quantity,unit_price_minor,line_total_minor) VALUES ('i','o','var-lamp-sage','Arc Desk Lamp','Sage','ARC-SAGE',1,249900,249900)",
    );
    db.exec("UPDATE product_variants SET price_minor = 299900 WHERE id = 'var-lamp-sage'");
    assert.equal(
      db.prepare("SELECT unit_price_minor FROM order_items WHERE id = 'i'").get().unit_price_minor,
      249900,
    );
    assert.throws(
      () => db.exec("DELETE FROM product_variants WHERE id = 'var-lamp-sage'"),
      /FOREIGN KEY/,
    );
    assert.throws(() => db.exec("DELETE FROM users WHERE id = 'u'"), /FOREIGN KEY/);
  }));

test('duplicate checkout keys cannot reference two different orders', () =>
  withDatabase((db) => {
    db.exec(
      "INSERT INTO users (id,email,name,password_hash) VALUES ('u','test@example.com','Test','test-only-non-credential')",
    );
    for (const id of ['o1', 'o2']) {
      db.prepare(
        "INSERT INTO orders (id,order_number,user_id,payment_status,subtotal_minor,shipping_minor,tax_minor,total_minor,delivery_json) VALUES (?,?, 'u','SIMULATED_SUCCESS',0,0,0,0,'{}')",
      ).run(id, `CC-${id}`);
    }
    const insert = db.prepare(
      'INSERT INTO checkout_idempotency_keys (user_id,key,request_hash,order_id) VALUES (?,?,?,?)',
    );
    insert.run('u', 'example-checkout-key', 'a'.repeat(64), 'o1');
    assert.throws(() => insert.run('u', 'example-checkout-key', 'a'.repeat(64), 'o2'), /UNIQUE/);
    assert.equal(db.prepare('SELECT order_id FROM checkout_idempotency_keys').get().order_id, 'o1');
  }));
