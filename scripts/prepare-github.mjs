import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { reviewRepository } from './check-repository.mjs';

const review = reviewRepository();
if (!review.passed) throw new Error('Resolve npm run repo:check findings before preparing source.');
const files = execFileSync(
  'git',
  ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
  { encoding: 'utf8' },
)
  .split('\0')
  .filter(Boolean);
mkdirSync('output', { recursive: true });
const destination = mkdtempSync(resolve('output/github-ready-'));
const manifest = [];
for (const file of files) {
  const target = join(destination, file);
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(file, target);
  manifest.push({
    path: file,
    sha256: createHash('sha256').update(readFileSync(file)).digest('hex'),
  });
}
writeFileSync(
  destination + '.manifest.json',
  JSON.stringify({ sourceFiles: files.length, files: manifest }, null, 2) + '\n',
);
console.log(JSON.stringify({ destination, files: files.length, published: false }, null, 2));
