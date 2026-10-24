import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatCatalogPrice,
  loadAdminPublishedCatalog,
  searchAdminPublishedCatalog,
  validateAdminPublishedCatalog,
} from '../src/catalog-read-model.js';

const item = (number, overrides = {}) => ({
  id: `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`,
  name: `Plato ${number}`,
  category: 'Primeros',
  priceCents: 1250,
  available: true,
  allergens: [],
  ...overrides,
});

const response = (items) => ({version: 1, scope: 'published', items});

test('validates and freezes the documented published catalog projection', () => {
  const catalog = validateAdminPublishedCatalog(response([
    item(1, {name: 'Crema de calabaza', allergens: ['Apio']}),
    item(2, {category: 'Postres', priceCents: 700, available: false}),
  ]));

  assert.equal(catalog.version, 1);
  assert.equal(catalog.scope, 'published');
  assert.deepEqual(Object.keys(catalog.items[0]), ['id', 'name', 'category', 'priceCents', 'available', 'allergens']);
  assert.ok(Object.isFrozen(catalog));
  assert.ok(Object.isFrozen(catalog.items));
  assert.ok(Object.isFrozen(catalog.items[0]));
  assert.ok(Object.isFrozen(catalog.items[0].allergens));
});

test('fails closed for drafts, extra fields, duplicates and invalid public values', () => {
  for (const payload of [
    {version: 1, scope: 'draft', items: []},
    {version: 2, scope: 'published', items: []},
    {...response([]), nextCursor: null},
    response([item(1, {draft: {name: 'Privado'}})]),
    response([item(1), item(1)]),
    response([item(1, {category: 'Entrantes'})]),
    response([item(1, {priceCents: -1})]),
    response([item(1, {available: 'yes'})]),
    response([item(1, {name: ' Plato con espacios '})]),
    response([item(1, {allergens: ['']})]),
  ]) {
    assert.throws(() => validateAdminPublishedCatalog(payload), /invalid_admin_published_catalog/);
  }
});

test('rejects accessors before reading hostile catalog fields or allergens', () => {
  let itemGetterCalls = 0;
  const hostileItem = item(1);
  Object.defineProperty(hostileItem, 'name', {
    enumerable: true,
    get() {
      itemGetterCalls += 1;
      return 'No debe leerse';
    },
  });
  assert.throws(() => validateAdminPublishedCatalog(response([hostileItem])), /invalid_admin_published_catalog/);
  assert.equal(itemGetterCalls, 0);

  let allergenGetterCalls = 0;
  const allergens = ['Apio'];
  Object.defineProperty(allergens, '0', {
    enumerable: true,
    get() {
      allergenGetterCalls += 1;
      return 'No debe leerse';
    },
  });
  assert.throws(() => validateAdminPublishedCatalog(response([item(1, {allergens})])), /invalid_admin_published_catalog/);
  assert.equal(allergenGetterCalls, 0);
});

test('loads through an injected gateway once and forwards cancellation without hidden retries', async () => {
  const calls = [];
  const controller = new AbortController();
  const gateway = {
    async listPublished(request) {
      calls.push(request);
      return response([item(1)]);
    },
  };

  const catalog = await loadAdminPublishedCatalog(gateway, {signal: controller.signal});
  assert.equal(catalog.items.length, 1);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], {signal: controller.signal});
  assert.ok(Object.isFrozen(calls[0]));

  let failedCalls = 0;
  await assert.rejects(loadAdminPublishedCatalog({
    async listPublished() {
      failedCalls += 1;
      throw new Error('catalog unavailable');
    },
  }), /catalog unavailable/);
  assert.equal(failedCalls, 1);
});

test('filters the validated projection locally by category, name and allergen', () => {
  const items = validateAdminPublishedCatalog(response([
    item(1, {name: 'Crème vegetal', category: 'Primeros'}),
    item(2, {name: 'Tarta', category: 'Postres', allergens: ['Frutos secos']}),
    item(3, {name: 'Agua', category: 'Bebidas'}),
  ])).items;

  assert.deepEqual(searchAdminPublishedCatalog(items, {query: 'creme'}).map((entry) => entry.id), [items[0].id]);
  assert.deepEqual(searchAdminPublishedCatalog(items, {query: 'secos'}).map((entry) => entry.id), [items[1].id]);
  assert.deepEqual(searchAdminPublishedCatalog(items, {category: 'Bebidas'}).map((entry) => entry.id), [items[2].id]);
  assert.throws(() => searchAdminPublishedCatalog(items, {category: 'Borradores'}), /invalid_admin_catalog_filter/);
});

test('formats integer cents and rejects client-side prices outside the contract', () => {
  assert.match(formatCatalogPrice(1250), /12,50/);
  assert.throws(() => formatCatalogPrice(-1), /invalid_admin_catalog_price/);
  assert.throws(() => formatCatalogPrice(12.5), /invalid_admin_catalog_price/);
});
