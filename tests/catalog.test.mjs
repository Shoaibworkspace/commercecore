import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import {
  catalogSchema,
  readFilters,
  selectProducts,
  startingPrice,
  formatPrice,
} from '../frontend/src/features/catalog/model.ts';

const allProducts = catalogSchema.parse(
  JSON.parse(readFileSync(new URL('../frontend/public/catalog.json', import.meta.url), 'utf8')),
);
const products = allProducts.slice(0, 12);
const select = (query, category) =>
  selectProducts(products, readFilters(new URLSearchParams(query), category));

test('currency display retains paise and Indian digit grouping', () => {
  assert.equal(formatPrice(79900), '₹799');
  assert.equal(formatPrice(79950), '₹799.50');
  assert.equal(formatPrice(79951), '₹799.51');
  assert.equal(formatPrice(12345600), '₹1,23,456');
});

test('sample catalog validates, has unique URLs, and references only existing local illustrations', () => {
  assert.equal(products.length, 12);
  assert.equal(new Set(products.map((product) => product.slug)).size, products.length);
  for (const product of products) {
    for (const image of [
      ...product.variants.flatMap((variant) => [variant.image, variant.detailImage]),
      ...product.gallery.map((item) => item.image),
    ]) {
      assert.ok(existsSync(new URL(`../frontend/public${image}`, import.meta.url)), image);
    }
  }
});

test('search matches case-insensitive name and material; malicious-looking text remains literal', () => {
  assert.equal(select('q=ARC').products[0].slug, 'arc-desk-lamp');
  assert.equal(select('q=stoneware').total, 2);
  assert.equal(select('q=%3Cscript%3E').total, 0);
  assert.equal(select("q=' OR 1=1 --").total, 0);
});

test('category, price and stock filters compose', () => {
  const result = select('min=700&max=1200&stock=1', 'home');
  assert.deepEqual(result.products.map((product) => product.slug).sort(), [
    'gather-wooden-tray',
    'studio-ceramic-cup',
  ]);
  assert.equal(select('stock=1').total, 11);
});

test('price range must match a real variant, not the gap between two variants', () => {
  assert.equal(select('min=2200&max=2300', 'home').total, 0);
  assert.equal(select('min=2400&max=2500', 'home').products[0].slug, 'woven-cotton-throw');
});

test('stock and price must match the same variant', () => {
  const product = structuredClone(products[0]);
  product.variants = [
    { ...product.variants[0], priceMinor: 10000, stock: 0 },
    { ...product.variants[1], priceMinor: 20000, stock: 2 },
  ];
  const results = selectProducts([product], readFilters(new URLSearchParams('max=150&stock=1')));
  assert.equal(results.total, 0);
});

test('sort orders prices consistently, with no mutation of source catalog', () => {
  const original = products.map((product) => product.id);
  const ascending = select('sort=price-asc').products.map(startingPrice);
  assert.deepEqual(
    ascending,
    [...ascending].sort((a, b) => a - b),
  );
  const descending = select('sort=price-desc').products.map(startingPrice);
  assert.deepEqual(
    descending,
    [...descending].sort((a, b) => b - a),
  );
  assert.deepEqual(
    products.map((product) => product.id),
    original,
  );
});

test('pagination has disjoint pages and clamps invalid and excessive page values', () => {
  const first = select('page=1');
  const second = select('page=2');
  assert.equal(first.products.length, 6);
  assert.equal(second.products.length, 6);
  assert.equal(first.totalPages, 2);
  assert.ok(
    second.products.every((product) => !first.products.some((item) => item.id === product.id)),
  );
  assert.equal(select('page=9999').page, 2);
  assert.equal(select('page=-1').page, 1);
  assert.equal(select('page=oops').page, 1);
});

test('malformed URL filters are bounded and inverted prices produce no matches', () => {
  const filters = readFilters(
    new URLSearchParams(`min=NaN&max=-9&sort=unsafe&q=${'a'.repeat(200)}`),
  );
  assert.equal(filters.min, undefined);
  assert.equal(filters.max, undefined);
  assert.equal(filters.sort, 'featured');
  assert.equal(filters.q.length, 100);
  assert.equal(select('min=2500&max=700').total, 0);
});
