import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';

mkdirSync(new URL('../.wrangler/', import.meta.url), { recursive: true });
writeFileSync(
  new URL('../.wrangler/auth-probe.json', import.meta.url),
  JSON.stringify({
    name: 'commercecore-auth-probe',
    account_id: 'fd5aa15cecee0d82004bd3e3f20ac281',
    main: '../scripts/auth-cpu-probe.ts',
    compatibility_date: '2026-08-01',
    compatibility_flags: ['nodejs_compat'],
    workers_dev: true,
    observability: { enabled: true, head_sampling_rate: 1 },
    vars: { PROBE_TOKEN: randomBytes(32).toString('hex') },
  }),
);
console.log('Prepared isolated synthetic probe configuration; token not printed.');
