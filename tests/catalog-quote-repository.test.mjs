import test from 'node:test';
import assert from 'node:assert/strict';
import {createCatalogQuoteRepository} from '../apps/api/src/catalog-quote-repository.mjs';
import {createCatalogQuoteIssuer} from '../apps/api/src/catalog-quote-issuer.mjs';

const tableId='00000000-0000-4000-8000-000000000001';
const sessionId='00000000-0000-4000-8000-000000000002';
const itemId='00000000-0000-4000-8000-000000000003';
const quoteId='00000000-0000-4000-8000-000000000004';
const input={tableId,visitId:'visit-1',actorId:'actor-1',basketId:'basket-1',
 qrToken:'q'.repeat(64),customerSessionToken:'s'.repeat(64),itemId,
 selection:{options:{},extras:[]},quantity:1};
const snapshot={name:'Plato CI',category:'Primeros',allergens:[],priceCents:1000,
 options:[],extras:[],discount:null};

function fixture({authorized=true,soldOut=false,insertFails=false}={}){
 const statements=[];
 const query=async(sql,args)=>{
  statements.push({sql,args});
  if(sql.includes('FROM sabora.dining_tables'))return {rows:authorized?[{
   table_id:tableId,session_id:sessionId,visit_id:'visit-1',actor_id:'actor-1',
   customer_alias:'Cliente',customer_identifier:'SB-23456789ABCD'
  }]:[]};
  if(sql.includes('FROM sabora.catalog_items'))return {rows:[{
   published_revision:'1',published_snapshot:snapshot,withdrawn_at:null,sold_out:soldOut
  }]};
  if(sql.includes('INSERT INTO sabora.catalog_displayed_quotes')){
   if(insertFails)throw Error('insert_failed');
   return {rows:[{id:quoteId}]};
  }
  throw Error('unexpected_sql');
 };
 const events=[];
 const issue=createCatalogQuoteIssuer({
  withTransaction:async work=>{
   events.push('BEGIN');
   try{
    const result=await work(query);
    events.push('COMMIT');return result;
   }catch(error){events.push('ROLLBACK');throw error;}
  },
  repository:createCatalogQuoteRepository(),clock:()=>1700000000000
 });
 return {issue,events,statements};
}
test('composed quote repository verifies visit, locks published price and inserts evidence atomically',async()=>{
 const {issue,events,statements}=fixture();
 const result=await issue(input);
 assert.equal(result.quoteId,quoteId);
 assert.equal(result.evidence.totalCents,1000);
 assert.deepEqual(events,['BEGIN','COMMIT']);
 assert.equal(statements.length,3);
 assert.match(statements[0].sql,/FOR UPDATE OF t FOR SHARE OF v,s/);
 assert.match(statements[1].sql,/FOR SHARE/);
 assert.match(statements[2].sql,/INSERT INTO sabora.catalog_displayed_quotes/);
 assert.equal(statements[2].args[0],tableId);
 assert.equal(statements[2].args[1],sessionId);
 assert.equal(statements[2].args[5],itemId);
 assert.equal(statements[2].args[9],1000);
 assert.equal(JSON.parse(statements[2].args[10]).totalCents,1000);
 assert.equal(statements[2].args[11],'2023-11-14T22:18:20.000Z');
 assert.equal(JSON.stringify(statements.slice(1)).includes(input.qrToken),false);
 assert.equal(JSON.stringify(statements.slice(1)).includes(input.customerSessionToken),false);
});
test('revoked visit prevents catalog reads and writes',async()=>{
 const {issue,events,statements}=fixture({authorized:false});
 await assert.rejects(issue(input),/catalog_quote_context_forbidden/);
 assert.deepEqual(events,['BEGIN','ROLLBACK']);
 assert.equal(statements.length,1);
});
test('sold-out catalog prevents insertion under same transaction',async()=>{
 const {issue,events,statements}=fixture({soldOut:true});
 await assert.rejects(issue(input),/catalog_quote_unavailable/);
 assert.deepEqual(events,['BEGIN','ROLLBACK']);
 assert.equal(statements.length,2);
});
test('failed quote insert propagates error and rolls back',async()=>{
 const {issue,events,statements}=fixture({insertFails:true});
 await assert.rejects(issue(input),/insert_failed/);
 assert.deepEqual(events,['BEGIN','ROLLBACK']);
 assert.equal(statements.length,3);
});
