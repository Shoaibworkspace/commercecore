import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
const budgets = {
  entryJavascriptGzip: 90000,
  totalJavascriptGzip: 250000,
  cssGzip: 20000,
  largestPhoto: 300000,
  // 100-product catalog. Per-photo limit stays fixed; listings lazy-load each page.
  totalPhotos: 8000000,
};
const assets = readdirSync('dist/assets').map((name) => ({
  name,
  bytes: statSync(join('dist/assets', name)).size,
  gzip: gzipSync(readFileSync(join('dist/assets', name))).length,
}));
const photos = readdirSync('frontend/public/images/photos')
  .filter((name) => name.endsWith('.webp'))
  .map((name) => ({ name, bytes: statSync(join('frontend/public/images/photos', name)).size }));
const entry = assets.find((asset) => /^index-.*\.js$/.test(asset.name));
if (!entry || !photos.length)
  throw new Error('Build the frontend and provide catalog photos before checking budgets.');
const measured = {
  entryJavascriptGzip: entry.gzip,
  totalJavascriptGzip: assets
    .filter((a) => a.name.endsWith('.js'))
    .reduce((sum, a) => sum + a.gzip, 0),
  cssGzip: assets.filter((a) => a.name.endsWith('.css')).reduce((sum, a) => sum + a.gzip, 0),
  largestPhoto: Math.max(...photos.map((p) => p.bytes)),
  totalPhotos: photos.reduce((sum, p) => sum + p.bytes, 0),
};
const failures = Object.keys(budgets).filter((key) => measured[key] > budgets[key]);
const report = {
  measuredAtUTC: new Date().toISOString(),
  units: 'bytes',
  budgets,
  measured,
  passed: !failures.length,
  assets,
  photoCount: photos.length,
  scope:
    'Built artifact sizes. Gzip levels use Node defaults. Total JS includes lazy routes; this is not the initial page transfer or a browser speed score.',
};
const reportAt = process.argv.indexOf('--report');
if (reportAt >= 0)
  writeFileSync(process.argv[reportAt + 1], JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ budgets, measured, passed: report.passed }, null, 2));
if (failures.length) throw new Error(`Asset budgets exceeded: ${failures.join(', ')}`);
