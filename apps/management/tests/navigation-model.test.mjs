import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MANAGEMENT_AREAS,
  parseManagementArea,
  toManagementHash,
} from '../src/navigation-model.js';

test('every management area has a stable deep-link', () => {
  assert.deepEqual(MANAGEMENT_AREAS, ['resumen', 'catalogo', 'mesas', 'comandas', 'equipo']);
  for (const area of MANAGEMENT_AREAS) {
    assert.equal(parseManagementArea(toManagementHash(area)), area);
  }
});

test('unknown, malformed or differently-cased hashes fail safely to summary', () => {
  for (const value of ['', '#', '#MESAS', '#mesas?demo=true', '#ajustes', null, undefined, 12]) {
    assert.equal(parseManagementArea(value), 'resumen');
  }
  assert.throws(() => toManagementHash('unknown'), /invalid_management_area/);
});
