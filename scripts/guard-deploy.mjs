import { readFileSync } from 'node:fs';
const configPath = process.argv[2] ?? new URL('../wrangler.production.jsonc', import.meta.url);
let config;
try {
  config = JSON.parse(readFileSync(configPath, 'utf8'));
} catch {
  console.error(
    'Deployment blocked: copy wrangler.production.example.jsonc to wrangler.production.jsonc and configure your own hosted resources.',
  );
  process.exit(1);
}
if (
  !/^[0-9a-f]{32}$/i.test(config?.account_id ?? '') ||
  !/^[0-9a-f-]{36}$/i.test(config?.d1_databases?.[0]?.database_id ?? '') ||
  config.d1_databases[0].database_id === '00000000-0000-0000-0000-000000000000' ||
  config.vars?.APP_ENV !== 'production'
) {
  console.error(
    'Deployment blocked: create your D1 database, replace database_id, and set APP_ENV to production. See docs/deployment.md.',
  );
  process.exit(1);
}
let exactHTTPSOrigin = false;
try {
  const origin = new URL(config.vars.APP_ORIGIN);
  exactHTTPSOrigin = origin.protocol === 'https:' && origin.origin === config.vars.APP_ORIGIN;
} catch {
  /* Invalid configuration remains blocked. */
}
if (
  config.vars.AUTH_PUBLIC_ENABLED !== 'verified' ||
  !exactHTTPSOrigin ||
  config.vars.PAYMENT_MODE !== 'demo' ||
  config.vars.AUTH_PROVIDER !== 'supabase' ||
  !/^https:\/\/[a-z0-9]{20}\.supabase\.co$/.test(config.vars.SUPABASE_URL ?? '') ||
  !config.vars.SUPABASE_PUBLISHABLE_KEY?.startsWith('sb_publishable_')
) {
  console.error(
    'Deployment blocked: configure and verify Supabase Auth, demo payments and an exact HTTPS APP_ORIGIN before setting AUTH_PUBLIC_ENABLED=verified. See docs/accounts.md.',
  );
  process.exit(1);
}
