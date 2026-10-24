import { existsSync, readFileSync, readdirSync, writeFileSync, statSync } from 'node:fs';
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import { expandedProducts } from './expanded-catalog-data.mjs';

const assets = [],
  missing = [];
for (const p of expandedProducts) {
  const recordPath = new URL(`../.wrangler/catalog-images/${p.slug}.json`, import.meta.url);
  if (!existsSync(recordPath)) {
    missing.push(p.slug);
    continue;
  }
  const record = JSON.parse(readFileSync(recordPath, 'utf8'));
  const destination = new URL(`../frontend/public/images/photos/${p.slug}.webp`, import.meta.url);
  if (!existsSync(destination))
    await sharp(record.master)
      .rotate()
      .resize(640, 640, { fit: 'contain', background: '#f5f2ec' })
      .webp({ quality: 80, effort: 5 })
      .toFile(fileURLToPath(destination));
  const info = await sharp(readFileSync(destination)).metadata();
  assets.push({
    id: p.slug,
    prompt: record.prompt,
    path: `/images/photos/${p.slug}.webp`,
    width: info.width,
    height: info.height,
    bytes: statSync(destination).size,
  });
}
writeFileSync(
  new URL('../frontend/public/images/photos/expanded-provenance.json', import.meta.url),
  JSON.stringify(
    {
      source: 'Built-in imagegen; original unbranded sample product photographs',
      optimizedWith: 'Sharp, 640px WebP quality 80; generated masters retained locally',
      assets,
    },
    null,
    2,
  ) + '\n',
);
const files = readdirSync(new URL('../frontend/public/images/', import.meta.url), {
  recursive: true,
})
  .filter((p) => /\.(webp|svg|png|jpe?g)$/.test(p))
  .map((p) => '/images/' + p.replaceAll('\\', '/'))
  .sort();
writeFileSync(
  new URL('../shared/catalog-assets.ts', import.meta.url),
  `// Bundled files only; used by server-side catalog management validation.\nexport const catalogAssets = ${JSON.stringify(files, null, 2)} as const;\n`,
);
console.log(JSON.stringify({ ready: assets.length, missing }));
if (missing.length && !process.argv.includes('--partial')) process.exitCode = 1;
