import test from 'node:test';
import assert from 'node:assert/strict';
import {readdirSync, readFileSync} from 'node:fs';
import {extname} from 'node:path';
import {fileURLToPath} from 'node:url';

const sourceRoot = fileURLToPath(new URL('../src/', import.meta.url));

function readSources(directory) {
  return readdirSync(directory, {withFileTypes: true}).flatMap((entry) => {
    const absolute = `${directory}/${entry.name}`;
    if (entry.isDirectory()) return readSources(absolute);
    if (!['.tsx', '.css', '.js'].includes(extname(entry.name))) return [];
    return [{path: absolute, source: readFileSync(absolute, 'utf8')}];
  });
}

const sources = readSources(sourceRoot);
const combined = sources.map((file) => file.source).join('\n');
const css = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');

test('all contracted management workspaces are represented without operational fixtures', () => {
  for (const label of ['Resumen', 'Catálogo', 'Mesas y QR', 'Comandas', 'Equipo']) {
    assert.match(combined, new RegExp(label));
  }
  assert.match(combined, /Sin mesas conectadas/);
  assert.match(combined, /Sin catálogo conectado/);
  assert.match(combined, /Sin personal conectado/);
  assert.match(combined, /no se simulan comandas ni tiempos/i);
});

test('management source has no network, browser persistence or Google runtime integration', () => {
  assert.doesNotMatch(combined, /\bfetch\s*\(|\bXMLHttpRequest\b|\bWebSocket\b|\bEventSource\b/);
  assert.doesNotMatch(combined, /\blocalStorage\b|\bsessionStorage\b|document\.cookie/);
  assert.doesNotMatch(combined, /googleapis\.com|generativelanguage|aiplatform|AIza[0-9A-Za-z_-]+/i);
  assert.doesNotMatch(combined, /qrcode|qr-code|data:image\/[^;]+;base64/i);
});

test('navigation is deep-linkable and the tables transport remains injected and disconnected by default', () => {
  const main = readFileSync(new URL('../src/main.tsx', import.meta.url), 'utf8');
  const tables = readFileSync(new URL('../src/views/TablesView.tsx', import.meta.url), 'utf8');
  assert.match(main, /href=\{toManagementHash\(section\.id\)\}/);
  assert.match(main, /aria-current=\{area === section\.id \? 'page'/);
  assert.match(main, /window\.addEventListener\('popstate'/);
  assert.match(main, /<ManagementApp\/>/);
  assert.doesNotMatch(main, /<ManagementApp tablesGateway=/);
  assert.match(tables, /gateway\?: AdminTablesGateway/);
  assert.match(tables, /No se conserva una respuesta parcial/);
  assert.match(tables, /no existe sondeo automático/i);
});

test('tables cover read states while every mutation and QR operation stays locked', () => {
  const tables = readFileSync(new URL('../src/views/TablesView.tsx', import.meta.url), 'utf8');
  for (const state of ['disconnected', 'loading', 'ready', 'error']) {
    assert.match(tables, new RegExp(`'${state}'`));
  }
  for (const label of ['ABIERTA', 'PAUSADA', 'CERRADA']) assert.match(tables, new RegExp(label));
  assert.match(tables, /Cargar más mesas/);
  assert.match(tables, /Filtrar mesas cargadas/);
  assert.match(tables, /state-control[\s\S]*disabled/);
  assert.match(tables, /La lectura no expone secretos QR/);
});

test('privileged actions use the shared disabled control', () => {
  const primitives = readFileSync(new URL('../src/components/Primitives.tsx', import.meta.url), 'utf8');
  assert.match(primitives, /button className="button button--locked" type="button" disabled/);

  for (const action of [
    'Emitir QR',
    'Rotar QR',
    'Revocar QR',
    'Guardar borrador',
    'Publicar cambios',
    'Mejorar con Google',
    'Rechazar resultado',
    'Aprobar versión',
    'Aplicar al plato',
    'Preparar publicación',
    'Publicar en catálogo',
    'Cambiar estado',
    'Registrar incidencia',
    'Gestionar titularidad',
    'Activar acceso',
    'Suspender acceso',
  ]) {
    assert.match(combined, new RegExp(`<LockedButton[^>]*>${action}<\\/LockedButton>`));
  }
});

test('image studio is local-only and exposes the three approved review ratios', () => {
  const studio = readFileSync(new URL('../src/views/ImageStudio.tsx', import.meta.url), 'utf8');
  const model = readFileSync(new URL('../src/image-studio-model.js', import.meta.url), 'utf8');
  const lifecycle = readFileSync(new URL('../src/image-preview-lifecycle.js', import.meta.url), 'utf8');
  assert.match(studio, /type="file"/);
  assert.match(lifecycle, /createObjectURL/);
  assert.match(lifecycle, /revokeObjectURL/);
  assert.match(studio, /Sólo preparación local/);
  for (const ratio of ['5:4', '4:3', '1:1']) assert.match(model, new RegExp(ratio));
  for (const control of ['Iluminación', 'Encuadre', 'Fondo', 'Presentación']) assert.match(model, new RegExp(control));
  for (const state of ['Cargando', 'Error', 'Rechazada', 'Aprobada']) assert.match(studio, new RegExp(state));
});

test('approved visual tokens, responsive gates and accessibility motion rule remain present', () => {
  for (const token of ['#F8F7F4', '#FFFFFF', '#202622', '#146B57', '#D98B45']) {
    assert.match(css, new RegExp(token, 'i'));
  }
  assert.match(css, /button \{ min-height: 44px; \}/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /@media \(max-width: 900px\)/);
  assert.match(css, /@media \(max-width: 460px\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
});
