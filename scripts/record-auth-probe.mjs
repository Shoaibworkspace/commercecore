import { readFileSync, writeFileSync } from 'node:fs';

const raw = readFileSync(new URL('../.wrangler/auth-probe-tail.log', import.meta.url), 'utf8');
const events = raw
  .trim()
  .split(/\r?\n(?=\{)/)
  .map((part) => JSON.parse(part));
const report = {
  date: '2026-10-23',
  provider: 'Cloudflare Workers Free',
  compatibilityDate: '2026-08-01',
  iterations: 600000,
  events: events.map((event) => ({
    outcome: event.outcome,
    cpuTimeMs: event.cpuTime,
    wallTimeMs: event.wallTime,
    exceptions: event.exceptions?.map(({ name, message }) => ({ name, message })),
  })),
  conclusion:
    'Hosted native PBKDF2 rejected 600000 iterations. CPU headroom was not measured because hashing did not run. Local simulator success does not prove hosted support. Keep local hashing unchanged and use hosted Supabase Auth.',
};
writeFileSync(
  new URL('../docs/auth-hosted-probe.json', import.meta.url),
  JSON.stringify(report, null, 2) + '\n',
);
console.log('Saved sanitized execution evidence without request headers or credentials.');
