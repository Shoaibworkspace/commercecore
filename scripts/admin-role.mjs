// Explicit operator action only. Never run by seeding or signup.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { z } from 'zod';
const args = process.argv.slice(2),
  emailAt = args.indexOf('--email');
const email = z
  .email()
  .max(254)
  .parse((args[emailAt + 1] ?? '').trim().toLowerCase());
if (
  emailAt < 0 ||
  args.some(
    (arg, i) =>
      i !== emailAt + 1 && !['--email', '--grant', '--revoke', '--apply', '--remote'].includes(arg),
  ) ||
  args.includes('--grant') === args.includes('--revoke')
)
  throw new Error(
    'Use --email registered@example.com and either --grant or --revoke. Preview is the default; add --apply to change the database. --remote explicitly selects hosted production.',
  );
const literal = (value) => `'${value.replaceAll("'", "''")}'`,
  role = args.includes('--grant') ? 'admin' : 'customer';
const sql = args.includes('--apply')
  ? `UPDATE users SET role=${literal(role)},version=version+1,updated_at=unixepoch() WHERE email=${literal(email)} AND role<>${literal(role)} RETURNING id,email,role;`
  : `SELECT id,email,role FROM users WHERE email=${literal(email)};`;
const directory = mkdtempSync(join(tmpdir(), 'commercecore-role-')),
  file = join(directory, 'role.sql');
try {
  writeFileSync(file, sql);
  console.log(
    args.includes('--apply')
      ? `Applying explicit ${args.includes('--remote') ? 'REMOTE' : 'LOCAL'} role change. No account will be created.`
      : 'Preview only. No role will change. Check the matching email before adding --apply.',
  );
  const result = spawnSync(
    process.execPath,
    [
      resolve('node_modules/wrangler/bin/wrangler.js'),
      'd1',
      'execute',
      'commercecore-db',
      ...(args.includes('--remote')
        ? ['--remote', '--config', 'wrangler.production.jsonc']
        : ['--local']),
      '--file',
      file,
    ],
    { stdio: 'inherit' },
  );
  process.exitCode = result.status ?? 1;
} finally {
  unlinkSync(file);
  rmdirSync(directory);
}
