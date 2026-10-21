import test from 'node:test';
import assert from 'node:assert/strict';
import {readPublishedCatalog} from '../apps/api/src/catalog-reader-query.mjs';
test('catalog query uses only restricted RPC and projects safe fields',async()=>{
 let calls=0;
 const result=await readPublishedCatalog(async(sql,params)=>{
  calls++;assert.equal(sql,'SELECT id,published_snapshot,sold_out FROM sabora.read_published_catalog()');
  assert.deepEqual(params,[]);
  return {rows:[{id:'11111111-1111-4111-8111-111111111111',published_snapshot:{name:'Agua',category:'Bebidas',priceCents:100,allergens:[]},sold_out:true}]};
 });
 assert.equal(calls,1);
 assert.deepEqual(result,[{id:'11111111-1111-4111-8111-111111111111',name:'Agua',category:'Bebidas',priceCents:100,available:false,allergens:[]}]);
});
test('missing connection and invalid result fail closed',async()=>{
 await assert.rejects(readPublishedCatalog(),/catalog_reader_unavailable/);
 await assert.rejects(readPublishedCatalog(async()=>({rows:null})),/invalid_catalog_rows/);
 await assert.rejects(readPublishedCatalog(async()=>{throw Error('database_down')}),/database_down/);
});

test('SQL adapter rejects duplicate published IDs and oversized responses',async()=>{
 const row={id:'11111111-1111-4111-8111-111111111111',published_snapshot:{name:'Agua',category:'Bebidas',priceCents:100,allergens:[]},sold_out:false};
 await assert.rejects(readPublishedCatalog(async()=>({rows:[row,row]})),/invalid_catalog_row/);
 await assert.rejects(readPublishedCatalog(async()=>({rows:Array(501).fill(row)})),/invalid_catalog_rows/);
});
test('SQL adapter refuses malformed rows without exposing private draft',async()=>{
 const id='11111111-1111-4111-8111-111111111111';
 await assert.rejects(readPublishedCatalog(async()=>({rows:[{id,published_snapshot:{name:'Agua',category:'Bebidas',priceCents:100,allergens:[]},sold_out:null}]})),/invalid_catalog_row/);
 const items=await readPublishedCatalog(async()=>({rows:[{id,published_snapshot:{name:'Agua',category:'Bebidas',priceCents:100,allergens:[]},sold_out:false,draft:{secret:'private'}}]}));
 assert.equal(JSON.stringify(items).includes('private'),false);
});
