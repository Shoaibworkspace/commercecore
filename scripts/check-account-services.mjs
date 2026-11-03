import { readFileSync } from 'node:fs';
const config = JSON.parse(readFileSync('wrangler.production.jsonc', 'utf8'));
const checks = [];
for (const [name, url, headers] of [
  ['storefront backend', config.vars.APP_ORIGIN + '/api/health', {}],
  ['storefront database', config.vars.APP_ORIGIN + '/api/ready', {}],
  [
    'Supabase authentication',
    config.vars.SUPABASE_URL + '/auth/v1/health',
    { apikey: config.vars.SUPABASE_PUBLISHABLE_KEY },
  ],
]) {
  try {
    const response = await fetch(url, {
      headers,
      redirect: 'manual',
      signal: AbortSignal.timeout(5000),
    });
    checks.push({ name, passed: response.status === 200, status: response.status });
    await response.body?.cancel();
  } catch {
    checks.push({ name, passed: false, status: 'unreachable' });
  }
}
console.log(
  JSON.stringify(
    {
      checks,
      passed: checks.every((c) => c.passed),
      scope: 'Read-only availability checks. Does not prove email delivery or successful sign-in.',
    },
    null,
    2,
  ),
);
if (checks.some((c) => !c.passed)) process.exitCode = 1;
