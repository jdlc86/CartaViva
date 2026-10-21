import test from 'node:test';
import assert from 'node:assert/strict';
import {readCatalogPoolConfig} from '../apps/api/src/catalog-pool-config.mjs';
const good={SABORA_CATALOG_DB_HOST:'db.example.test',SABORA_CATALOG_DB_NAME:'postgres',
 SABORA_CATALOG_DB_USER:'sabora_catalog_login',SABORA_CATALOG_DB_PASSWORD:'local-test',
 SABORA_CATALOG_DB_CA_PEM:'-----BEGIN CERTIFICATE-----\nlocal-test\n-----END CERTIFICATE-----'};
test('dedicated catalog connection enforces TLS and low pool size',()=>{
 const config=readCatalogPoolConfig(good);
 assert.equal(config.user,'sabora_catalog_login');
 assert.equal(config.ssl.rejectUnauthorized,true);
 assert.equal(config.max,3);
 assert.equal(config.port,5432);
});
test('rejects missing credentials, unsafe identities, malformed TLS and ports',()=>{
 for(const patch of [{SABORA_CATALOG_DB_USER:'postgres'},{SABORA_CATALOG_DB_CA_PEM:''},
  {SABORA_CATALOG_DB_PORT:'0'},{SABORA_CATALOG_DB_PORT:'65536'},
  {SABORA_CATALOG_DB_HOST:'localhost/path'},{SABORA_CATALOG_DB_PASSWORD:''}]){
  assert.throws(()=>readCatalogPoolConfig({...good,...patch}),/invalid_catalog_pool_config/);
 }
});
