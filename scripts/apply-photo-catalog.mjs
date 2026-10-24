import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export function applyPhotoCatalog() {
  const catalogPath = new URL('../frontend/public/catalog.json', import.meta.url);
  const provenancePath = new URL(
    '../frontend/public/images/photos/provenance.json',
    import.meta.url,
  );
  if (!existsSync(provenancePath)) return;
  const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'));
  const provenance = JSON.parse(readFileSync(provenancePath, 'utf8'));
  for (const product of catalog) {
    const type = product.id.replace('prod-', '');
    // The original photo workflow must not overwrite the expanded catalog's own photographs.
    if (!provenance.assets.some((asset) => asset.id === `${type}-main`)) continue;
    for (const [index, variant] of product.variants.entries()) {
      const photo = `/images/photos/${type}-${index === 0 ? 'main' : 'alt'}.webp`;
      if (!existsSync(new URL(`../frontend/public${photo}`, import.meta.url)))
        throw new Error(`Missing product photograph: ${photo}`);
      variant.image = photo;
      variant.detailImage = photo;
    }
    product.gallery = [
      { image: product.variants[0].image, alt: `${product.name}, front view` },
      { image: product.variants[0].image, alt: `${product.name}, closer detail` },
    ];
    if (type === 'speaker') product.dimensions = 'Sample dimensions: 24 cm wide × 12 cm high.';
  }
  if (provenance.assets.length !== 25)
    throw new Error('The photo manifest must contain a hero and 24 product finishes.');
  writeFileSync(catalogPath, JSON.stringify(catalog, null, 2) + '\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) applyPhotoCatalog();
