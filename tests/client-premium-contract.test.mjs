import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,statSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const css=read('apps/client/src/style.css');
const app=read('apps/client/src/App.tsx');
const nav=read('apps/client/src/components/BottomNav.tsx');
const catalog=read('apps/client/src/catalog.ts');
const html=read('apps/client/index.html');
const manifest=JSON.parse(read('apps/client/public/manifest.webmanifest'));
const sw=read('apps/client/public/sw.js');
const walk=dir=>readdirSync(dir).flatMap(name=>{
 const path=join(dir,name);return statSync(path).isDirectory()?walk(path):[path];
});

test('client premium shell uses approved core tokens, V3 logo and balanced motion',()=>{
 for(const value of ['--canvas:#F8F7F4','--surface:#FFFFFF','--ink:#202622','--brand:#146B57','--accent:#D98B45'])assert.ok(css.includes(value),value);
 assert.match(app,/sabora-logo-outline-v3\.svg/);
 assert.match(css,/transition:[^}]*\.18s/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
 assert.match(css,/:focus-visible\{outline:3px solid var\(--focus\)/);
});

test('approved customer composition is present and categories are server-derived',()=>{
 for(const label of ['Información','Alérgenos','QR','Favoritos','Ajustes'])assert.ok(nav.includes(`'${label}'`),label);
 for(const icon of ["name={searchOpen?'close':'search'}","name=\"bag\"","name=\"bell\""])assert.ok(app.includes(icon),icon);
 assert.ok(app.indexOf('announcement-region')<app.indexOf('menu-title'));
 assert.match(catalog,/new Set\(items\.map\(item=>item\.category\)\)/);
 assert.doesNotMatch(catalog,/Primeros.*Segundos.*Postres/);
});

test('client bundle has no management, kitchen or staff API surface',()=>{
 const files=walk(fileURLToPath(new URL('../apps/client/src',import.meta.url)));
 const source=files.map(path=>readFileSync(path,'utf8')).join('\n');
 for(const forbidden of ['/api/v1/operations','/api/v1/staff','/management','order-operations','staff-lifecycle'])assert.equal(source.includes(forbidden),false,forbidden);
 assert.doesNotMatch(source,/from ['"][^'"]*management/);
});

test('PWA metadata and service worker cache only the shell, never API data',()=>{
 assert.match(html,/rel="manifest" href="\/manifest\.webmanifest"/);
 assert.equal(manifest.display,'standalone');
 assert.equal(manifest.theme_color,'#146B57');
 assert.equal(manifest.icons[0].purpose,'any maskable');
 assert.match(sw,/url\.pathname\.startsWith\('\/api\/'\)/);
 assert.doesNotMatch(sw,/api\/v1\/catalog['"]/);
});

test('responsive and accessible static gates cover touch targets, mobile grids and honest actions',()=>{
 assert.match(css,/min-height:44px/);
 assert.match(css,/@media\(max-width:560px\)/);
 assert.match(css,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
 assert.match(app,/Reserva no disponible/);
 assert.match(app,/Validación de QR todavía no activada/);
 assert.match(app,/role="dialog"|<Modal/);
});
