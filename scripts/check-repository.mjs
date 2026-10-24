import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export function credentialFindings(text) {
  const checks = [
    ['private-key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
    [
      'provider-secret',
      /(?:sb_secret_|xkeysib-|xsmtpsib-|gh[pousr]_|github_pat_)[A-Za-z0-9_-]{16,}/,
    ],
    ['aws-access-key', /\bAKIA[A-Z0-9]{16}\b/],
    ['literal-auth-secret', /AUTH_SECRET["']?\s*[:=]\s*["'][0-9a-f]{64}["']/i],
  ];
  const results = checks.filter(([, pattern]) => pattern.test(text)).map(([name]) => name);
  for (const token of text.match(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g) ?? []) {
    try {
      if (
        JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).role === 'service_role'
      )
        results.push('service-role-token');
    } catch {
      /* Other dotted text is not a provider token. */
    }
  }
  return [...new Set(results)];
}

export function reviewRepository() {
  const files = execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    { encoding: 'utf8' },
  )
    .split('\0')
    .filter(Boolean);
  const findings = [];
  const prohibited =
    /(^|\/)(?:node_modules|\.wrangler|\.worker-build|dist|backups)\/|(^|\/)(?:\.dev\.vars(?:\..+)?|\.env(?:\..+)?|wrangler\.production\.jsonc)$|\.(?:sqlite(?:-shm|-wal)?|db(?:-shm|-wal)?|dump)$/;
  for (const path of files) {
    if (prohibited.test(path) && !path.endsWith('.example'))
      findings.push({ path, kind: 'private-or-generated-file' });
    const info = statSync(path);
    if (info.size > 25_000_000) {
      findings.push({ path, kind: 'large-file' });
      continue;
    }
    if (/\.(?:png|jpe?g|webp|woff2?|ico|pdf)$/i.test(path)) continue;
    const text = readFileSync(path, 'utf8');
    for (const kind of credentialFindings(text)) findings.push({ path, kind });
  }
  return {
    passed: findings.length === 0,
    filesChecked: files.length,
    findings,
    scope:
      'Git upload candidates only; known credential signatures and private/generated paths. Not a guarantee that every secret can be detected.',
  };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const report = reviewRepository();
  console.log(JSON.stringify(report, null, 2));
  if (!report.passed) process.exitCode = 1;
}
