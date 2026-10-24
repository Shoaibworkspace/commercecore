import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('deployment guard blocks local authentication, non-demo payments and invalid production configuration', () => {
  const root = mkdtempSync(join(tmpdir(), 'commercecore-deploy-test-'));
  try {
    const base = JSON.parse(readFileSync('wrangler.production.example.jsonc', 'utf8'));
    base.account_id = 'a'.repeat(32);
    base.d1_databases[0].database_id = '11111111-1111-4111-8111-111111111111';
    base.vars.APP_ORIGIN = 'https://store.example';
    base.vars.SUPABASE_URL = 'https://abcdefghijklmnopqrst.supabase.co';
    base.vars.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_synthetic_test_only';
    base.vars.AUTH_PUBLIC_ENABLED = 'verified';
    const file = join(root, 'config.json');
    const check = (config) => {
      writeFileSync(file, JSON.stringify(config));
      return spawnSync(process.execPath, ['scripts/guard-deploy.mjs', file], { encoding: 'utf8' });
    };
    assert.equal(check(base).status, 0);
    for (const vars of [
      { AUTH_PROVIDER: 'local' },
      { AUTH_PUBLIC_ENABLED: 'disabled' },
      { PAYMENT_MODE: 'real' },
      { APP_ENV: 'development' },
      { APP_ORIGIN: 'http://store.example' },
      { APP_ORIGIN: 'https://store.example/path' },
      { SUPABASE_URL: 'https://evil.example' },
      { SUPABASE_PUBLISHABLE_KEY: 'service-role-key-not-allowed' },
    ])
      assert.equal(check({ ...base, vars: { ...base.vars, ...vars } }).status, 1);
    const local = structuredClone(base);
    local.d1_databases[0].database_id = '00000000-0000-0000-0000-000000000000';
    assert.equal(check(local).status, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
