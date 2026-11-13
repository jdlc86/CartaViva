import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

// This is a drift guard for a CRITICAL normative security exception.
// It does not replace actual PostgreSQL 17 privilege/ownership tests or an
// independent review, and it does not authorize operating on the provider.
const read=relative=>readFileSync(new URL('../'+relative,import.meta.url),'utf8');
const gate=read('docs/SABORA_AUTHORIZATION_GATE.md');
const cv005=read('docs/security/SABORA_CV005_PG17_DBA_OWNER_AUTHORITY_DECISION_2026-11-12.md');
const hmac=read('docs/security/SABORA_P0_ACTOR_SQL_BINDING_DECISION.md');

test('CV-005 alone permits the exact PostgreSQL 17 DBA bootstrap membership, not runtime ownership',()=>{
 for(const term of [
  'DBA instalador', 'CREATEROLE', 'NOSUPERUSER',
  'ADMIN TRUE, SET FALSE, INHERIT FALSE',
  'antes del COMMIT', 'puede volver', 'SET TRUE',
  'Ningún contrato de continuidad'
 ])assert.ok(gate.includes(term),'P0 gate omitted '+term);
 for(const term of [
  'ADMIN TRUE, SET FALSE, INHERIT FALSE',
  'NOBYPASSRLS', 'NOLOGIN', 'CREATE ON SCHEMA sabora',
  'antes del COMMIT'
 ])assert.ok(cv005.includes(term),'CV005 authority omitted '+term);
 assert.match(gate,/NO permite[\s\S]*?\`LOGIN\`[\s\S]*?propietario \`SECURITY DEFINER\`/);
 assert.match(gate,/rechazo por defecto/);
});

test('P0 historical deny-all remains bounded and cannot authorize public grants or unverified SQL actors',()=>{
 assert.match(gate,/Corte P0 inicial \(preflight negativo\)/);
 assert.match(gate,/política temporal de cero grants|veto temporal/);
 assert.match(gate,/\`PUBLIC\/anon\/authenticated\`/);
 assert.match(gate,/\`FORCE RLS\`/);
 assert.match(gate,/corte original\*\* los logins runtime aún no existían ni tenían\s+membresías, DDL/);
 assert.match(hmac,/HMAC-SHA-256/);
 assert.match(gate,/sin membresías, con `USAGE` pero no `CREATE`/);
 assert.match(gate,/Ni esta conciliación ni la CI verde autorizan/);
});

test('Option A neither conceals the DBA self-grant risk nor changes the HMAC actor boundary',()=>{
 assert.match(cv005,/puede volver a concederse \`SET TRUE\`/);
 assert.match(cv005,/no hay aislamiento de la clave frente a un DBA comprometido/);
 assert.match(gate,/El propio DBA|DBA puede volver/);
 assert.match(hmac,/UUID, GUC, rol funcional y \`current_user\` no se aceptan como prueba/);
 assert.match(gate,/La regla de identidad vinculada a HMAC/);
 assert.match(gate,/sin[\s\S]{0,160}preflight/);
});
