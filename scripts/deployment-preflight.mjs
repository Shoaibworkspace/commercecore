import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Read-only: never authenticates, provisions resources, reads secrets or changes D1.
const root = new URL('../', import.meta.url);
const blockers = [];
const required = ['catalog.sql', 'storefront.sql', 'expanded.sql'];
for (const seed of required) {
  if (!existsSync(new URL(`backend/db/seed/${seed}`, root))) blockers.push(`Missing seed: ${seed}`);
}
const migrations = readdirSync(new URL('backend/db/migrations/', root)).filter((name) =>
  /^\d+.*\.sql$/.test(name),
);
if (!migrations.includes('0009_catalog_sale_prices.sql')) {
  blockers.push('Missing sale-price migration 0009.');
}
const productionPath = new URL('wrangler.production.jsonc', root);
const config = existsSync(productionPath) ? JSON.parse(readFileSync(productionPath, 'utf8')) : {};
if (!existsSync(productionPath))
  blockers.push(
    'Copy wrangler.production.example.jsonc to wrangler.production.jsonc and configure your own hosted resources.',
  );
if (config.vars?.PAYMENT_MODE !== 'demo') blockers.push('PAYMENT_MODE must remain demo.');
const guard = spawnSync(process.execPath, ['scripts/guard-deploy.mjs'], {
  cwd: fileURLToPath(root),
  encoding: 'utf8',
});
if (guard.status !== 0) {
  blockers.push(guard.stderr?.trim() || 'Deployment guard could not run.');
}
console.log(
  JSON.stringify(
    {
      configurationReady: blockers.length === 0,
      migrations: migrations.length,
      seeds: required,
      blockers,
      manualChecks: [
        'Cloudflare account authenticated and confirmed on Free plan.',
        'Remote D1 migrations and all three sample seeds applied.',
        'AUTH_SECRET configured privately; never upload local users or sessions.',
        'Supabase provider validated; local hashing must remain disabled in production.',
        'Email confirmation, custom SMTP and recovery delivery verified before public signup.',
        'Run npm run check and npm run format:check before publishing.',
        'Verify live catalog, account, cart, demo checkout and admin ownership.',
      ],
      note: 'A successful configuration check is not deployment or live acceptance.',
    },
    null,
    2,
  ),
);
if (blockers.length) process.exitCode = 1;
