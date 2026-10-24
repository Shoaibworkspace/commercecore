import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { applyPhotoCatalog } from './apply-photo-catalog.mjs';

const manifest = JSON.parse(
  readFileSync(new URL('../docs/image-prompts.json', import.meta.url), 'utf8'),
);
const out = new URL('../public/images/photos/', import.meta.url);
mkdirSync(out, { recursive: true });
const assets = [];
for (const asset of manifest.assets) {
  const source = new URL(`../output/imagegen/${asset.id}.png`, import.meta.url);
  const destination = new URL(`${asset.id}.webp`, out);
  const size = asset.id === 'hero-lifestyle' ? 1600 : 960;
  await sharp(fileURLToPath(source))
    .rotate()
    .resize({ width: size, withoutEnlargement: true })
    .webp({ quality: 85, effort: 5 })
    .toFile(fileURLToPath(destination));
  const metadata = await sharp(fileURLToPath(destination)).metadata();
  assets.push({
    ...asset,
    path: `/images/photos/${asset.id}.webp`,
    width: metadata.width,
    height: metadata.height,
    bytes: statSync(destination).size,
  });
}
writeFileSync(
  new URL('provenance.json', out),
  JSON.stringify(
    {
      source: 'Built-in imagegen; AI-generated sample product photography',
      optimizedWith: 'Sharp WebP encoding; original masters retained locally',
      assets,
    },
    null,
    2,
  ) + '\n',
);
applyPhotoCatalog();
console.log(
  `Optimized ${assets.length} generated photos: ${(assets.reduce((sum, asset) => sum + asset.bytes, 0) / 1024 / 1024).toFixed(2)} MiB total.`,
);
