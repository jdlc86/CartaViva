import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const contract = read('docs/DESIGN_SYSTEM_CONTRACT.md');
const home = read('docs/design/screens/SABORA_HOME_IMPLEMENTATION_V1.md');
const reference = read('docs/design/SABORA_VISUAL_REFERENCE_EVOLVING_2026-10-26.md');
const html = read('docs/design/references/sabora-client-home-v1.html');
const logo = read('docs/design/brand/sabora-logo-outline-v3.svg');

test('approved Sabora visual reference and V3 brand asset remain versioned', () => {
  assert.match(logo, /<svg\b/);
  assert.match(reference, /REFERENCIA MEJORABLE/);
  for (const hex of ['#F8F7F4','#FFFFFF','#202622','#146B57','#D98B45']) {
    assert.ok(reference.includes(hex), 'Missing approved reference color: ' + hex);
  }
  assert.match(reference, /Cocina y gestión/);
});

test('approved home contracts keep announcements, QR and dynamic categories', () => {
  for (const fragment of ['fotografía de un anuncio es **opcional**', 'Rotación automática cíclica', 'QR central', 'categorías no se definen como lista fija']) {
    assert.ok(home.includes(fragment), 'Missing approved home contract: ' + fragment);
  }
  assert.match(contract, /intensidad visual \*\*EQUILIBRADA\*\*/);
  assert.match(contract, /PROHIBIDO trasladar a la PWA final selectores manuales/);
});

test('existing reference retains usable announcement controls and logo', () => {
  for (const fragment of ['sabora-logo-outline-v3.svg', 'adPrevious', 'adNext', 'adImage', 'restartAds', 'prefers-reduced-motion', 'data-action="qr"']) {
    assert.ok(html.includes(fragment), 'Missing reference implementation: ' + fragment);
  }
});
