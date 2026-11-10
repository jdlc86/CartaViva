const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/u;

export const CATALOG_CATEGORIES = Object.freeze(['Todos', 'Bebidas', 'Primeros', 'Segundos', 'Postres']);
const PUBLISHED_CATEGORIES = new Set(CATALOG_CATEGORIES.slice(1));

function isDataRecord(value, expectedKeys) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;

  const keys = Reflect.ownKeys(value);
  if (keys.length !== expectedKeys.length || keys.some((key) => typeof key !== 'string')) return false;
  const actualKeys = new Set(keys);
  if (expectedKeys.some((key) => !actualKeys.has(key))) return false;

  return keys.every((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor?.enumerable === true && Object.hasOwn(descriptor, 'value');
  });
}

function isDataArray(value, maximumLength) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > maximumLength) {
    return false;
  }

  const keys = Reflect.ownKeys(value);
  if (keys.some((key) => typeof key !== 'string')) return false;
  const entries = keys.filter((key) => key !== 'length');
  if (entries.length !== value.length || entries.some((key, index) => key !== String(index))) return false;

  return entries.every((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor?.enumerable === true && Object.hasOwn(descriptor, 'value');
  });
}

function validText(value, maximumLength) {
  return typeof value === 'string' && Boolean(value.trim()) &&
    [...value].length <= maximumLength && !CONTROL_CHARACTER_PATTERN.test(value);
}

export function validateAdminPublishedCatalog(payload) {
  if (!isDataRecord(payload, ['version', 'scope', 'items']) ||
      payload.version !== 1 || payload.scope !== 'published' || !isDataArray(payload.items, 500)) {
    throw new Error('invalid_admin_published_catalog');
  }

  const ids = new Set();
  const items = payload.items.map((item) => {
    if (!isDataRecord(item, ['id', 'name', 'category', 'priceCents', 'available', 'allergens']) ||
        typeof item.id !== 'string' || !UUID_PATTERN.test(item.id) || ids.has(item.id.toLowerCase()) ||
        !validText(item.name, 160) || item.name !== item.name.trim() ||
        !PUBLISHED_CATEGORIES.has(item.category) ||
        !Number.isSafeInteger(item.priceCents) || item.priceCents < 0 ||
        typeof item.available !== 'boolean' || !isDataArray(item.allergens, 32) ||
        !item.allergens.every((allergen) => validText(allergen, 100))) {
      throw new Error('invalid_admin_published_catalog');
    }

    ids.add(item.id.toLowerCase());
    return Object.freeze({
      id: item.id,
      name: item.name,
      category: item.category,
      priceCents: item.priceCents,
      available: item.available,
      allergens: Object.freeze([...item.allergens]),
    });
  });

  return Object.freeze({
    version: 1,
    scope: 'published',
    items: Object.freeze(items),
  });
}

export async function loadAdminPublishedCatalog(gateway, {signal} = {}) {
  if (gateway === null || typeof gateway !== 'object' || typeof gateway.listPublished !== 'function') {
    throw new Error('admin_catalog_gateway_unavailable');
  }

  const request = Object.freeze({signal});
  const payload = await gateway.listPublished(request);
  return validateAdminPublishedCatalog(payload);
}

function normalizeSearch(value) {
  return value.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es-ES');
}

export function searchAdminPublishedCatalog(items, {category = 'Todos', query = ''} = {}) {
  if (!Array.isArray(items) || !CATALOG_CATEGORIES.includes(category) || typeof query !== 'string') {
    throw new Error('invalid_admin_catalog_filter');
  }

  const normalizedQuery = normalizeSearch(query);
  return Object.freeze(items.filter((item) =>
    (category === 'Todos' || item.category === category) &&
    (!normalizedQuery || [item.name, item.category, ...item.allergens]
      .some((value) => normalizeSearch(value).includes(normalizedQuery)))));
}

export function formatCatalogPrice(priceCents) {
  if (!Number.isSafeInteger(priceCents) || priceCents < 0) {
    throw new Error('invalid_admin_catalog_price');
  }
  return new Intl.NumberFormat('es-ES', {style: 'currency', currency: 'EUR'}).format(priceCents / 100);
}
