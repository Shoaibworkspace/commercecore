import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
const file = new URL('../.dev.vars', import.meta.url);
const current = existsSync(file) ? readFileSync(file, 'utf8') : '';
if (/^AUTH_SECRET\s*=/m.test(current))
  console.log('Local auth secret already configured; retained.');
else {
  writeFileSync(
    file,
    current +
      (current.endsWith('\n') || !current ? '' : '\n') +
      `AUTH_SECRET=${randomBytes(32).toString('hex')}\n`,
  );
  console.log(
    'Generated a local auth secret in ignored .dev.vars. No secret was printed. Restart Wrangler.',
  );
}
