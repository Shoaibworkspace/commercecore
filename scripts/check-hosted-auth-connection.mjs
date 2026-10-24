import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';

const config = JSON.parse(readFileSync('wrangler.production.jsonc', 'utf8'));
const origin = config.vars.APP_ORIGIN;
const bootstrap = await fetch(origin + '/api/auth/session', { signal: AbortSignal.timeout(20000) });
assert.equal(bootstrap.status, 200);
const session = (await bootstrap.json()).data;
const cookie = bootstrap.headers
  .getSetCookie()
  .map((value) => value.split(';')[0])
  .join('; ');
const response = await fetch(origin + '/api/auth/login', {
  method: 'POST',
  signal: AbortSignal.timeout(20000),
  headers: {
    Origin: origin,
    Cookie: cookie,
    'Content-Type': 'application/json',
    'X-CSRF-Token': session.csrfToken,
  },
  body: JSON.stringify({
    email: 'unregistered-probe-20261023@example.test',
    password: 'Synthetic diagnostic only 2026!',
  }),
});
const result = await response.json();
const report = {
  date: '2026-10-23',
  status: response.status,
  code: result.error?.code,
  passed: response.status === 400 && result.error?.code === 'AUTH_NOT_COMPLETED',
  scope:
    'One synthetic invalid login exercises the live Worker-to-provider connection. No real password, signup email or application session is used. This consumes one auth-rate-limit attempt.',
};
writeFileSync('docs/auth-hosted-connection-check.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
if (!report.passed) process.exitCode = 1;
