import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const cli = resolve('node_modules/wrangler/bin/wrangler.js');
const config = ['--config', 'wrangler.production.jsonc'];
const listed = spawnSync(process.execPath, [cli, 'secret', 'list', ...config], {
  encoding: 'utf8',
});
const output = `${listed.stdout ?? ''}\n${listed.stderr ?? ''}`;
if (listed.status === 0) {
  const secrets = JSON.parse(listed.stdout);
  if (!Array.isArray(secrets) || secrets.some((item) => typeof item.name !== 'string')) {
    throw new Error('Unexpected secret-list response; no secret changed.');
  }
  if (secrets.some((item) => item.name === 'AUTH_SECRET')) {
    console.log('AUTH_SECRET already exists; left unchanged.');
    process.exit(0);
  }
}
if (
  listed.status !== 0 &&
  !/10007|does not exist|could not be found|Worker "commercecore" not found/i.test(output)
) {
  throw new Error(
    'Cannot verify existing hosted secrets. No secret changed; check Cloudflare access.',
  );
}
const result = spawnSync(process.execPath, [cli, 'secret', 'put', 'AUTH_SECRET', ...config], {
  encoding: 'utf8',
  input: randomBytes(32).toString('hex') + '\n',
});
if (result.status !== 0)
  throw new Error('Hosted secret initialization failed; no secret value printed.');
console.log('Hosted AUTH_SECRET initialized privately; no local secret reused or printed.');
