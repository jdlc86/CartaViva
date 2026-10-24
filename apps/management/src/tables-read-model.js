const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const TABLE_PAGE_SIZE = 24;
export const TABLE_ORDERING_STATES = Object.freeze(['open', 'paused', 'closed']);

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

function assertPageRequest({afterNumber, limit}) {
  if (!Number.isSafeInteger(afterNumber) || afterNumber < 0 ||
      !Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new Error('invalid_admin_tables_page_request');
  }
}

export function validateAdminTablesPage(payload, {afterNumber = 0, limit = TABLE_PAGE_SIZE} = {}) {
  assertPageRequest({afterNumber, limit});
  if (!isDataRecord(payload, ['version', 'items', 'nextAfterNumber']) ||
      payload.version !== 1 || !Array.isArray(payload.items) || payload.items.length > limit) {
    throw new Error('invalid_admin_tables_page');
  }

  const ids = new Set();
  const numbers = new Set();
  const items = payload.items.map((item, index) => {
    if (!isDataRecord(item, ['id', 'number', 'capacity', 'description', 'orderingState']) ||
        typeof item.id !== 'string' || !UUID_PATTERN.test(item.id) || ids.has(item.id) ||
        !Number.isSafeInteger(item.number) || item.number <= afterNumber || numbers.has(item.number) ||
        (index > 0 && item.number <= payload.items[index - 1].number) ||
        !Number.isSafeInteger(item.capacity) || item.capacity < 1 ||
        (item.description !== null && typeof item.description !== 'string') ||
        !TABLE_ORDERING_STATES.includes(item.orderingState)) {
      throw new Error('invalid_admin_tables_page');
    }

    ids.add(item.id);
    numbers.add(item.number);
    return Object.freeze({
      id: item.id,
      number: item.number,
      capacity: item.capacity,
      description: item.description,
      orderingState: item.orderingState,
    });
  });

  const nextAfterNumber = payload.nextAfterNumber;
  if (nextAfterNumber !== null &&
      (!Number.isSafeInteger(nextAfterNumber) || items.length === 0 ||
       nextAfterNumber !== items.at(-1).number || nextAfterNumber <= afterNumber)) {
    throw new Error('invalid_admin_tables_page');
  }

  return Object.freeze({
    version: 1,
    items: Object.freeze(items),
    nextAfterNumber,
  });
}

export async function loadAdminTablesPage(gateway, {
  afterNumber = 0,
  limit = TABLE_PAGE_SIZE,
  signal,
} = {}) {
  assertPageRequest({afterNumber, limit});
  if (gateway === null || typeof gateway !== 'object' || typeof gateway.listTables !== 'function') {
    throw new Error('admin_tables_gateway_unavailable');
  }

  const request = Object.freeze({afterNumber, limit, signal});
  const payload = await gateway.listTables(request);
  return validateAdminTablesPage(payload, {afterNumber, limit});
}

export function mergeAdminTables(currentItems, nextItems) {
  if (!Array.isArray(currentItems) || !Array.isArray(nextItems)) {
    throw new Error('invalid_admin_tables_merge');
  }

  const merged = [...currentItems, ...nextItems];
  const ids = new Set();
  const numbers = new Set();
  for (let index = 0; index < merged.length; index += 1) {
    const item = merged[index];
    if (!item || typeof item !== 'object' || ids.has(item.id) || numbers.has(item.number) ||
        (index > 0 && item.number <= merged[index - 1].number)) {
      throw new Error('invalid_admin_tables_merge');
    }
    ids.add(item.id);
    numbers.add(item.number);
  }

  return Object.freeze(merged);
}
