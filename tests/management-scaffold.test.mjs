import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../apps/management/src/main.tsx',import.meta.url),'utf8');
test('management scaffold declares all five restaurant areas',()=>{
 for(const area of ['resumen','catalogo','mesas','comandas','equipo']){
  assert.match(source,new RegExp("id:'"+area+"'"));
 }
});
test('management scaffold cannot perform privileged operations',()=>{
 assert.match(source,/Acceso administrativo no habilitado/);
 assert.match(source,/Sin acceso a datos/);
 assert.match(source,/NO OPERATIVA/);
 assert.doesNotMatch(source,/\bfetch\s*\(|\bXMLHttpRequest\b|\bWebSocket\b|\bEventSource\b/);
 assert.doesNotMatch(source,/\blocalStorage\b|\bsessionStorage\b|\bdocument\.cookie\b/);
 assert.doesNotMatch(source,/\b<form\b|type="submit"|onSubmit\s*=/);
});
test('management navigation remains keyboard accessible and identifies active area',()=>{
 assert.match(source,/aria-label="Áreas de gestión"/);
 assert.match(source,/type="button"/);
 assert.match(source,/aria-current=/);
 assert.match(source,/aria-live="polite"/);
});
