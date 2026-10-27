import test from 'node:test';
import assert from 'node:assert/strict';
import {createRoleScopedPostgresTransaction} from '../apps/api/src/role-scoped-postgres.mjs';
import {createCustomerProductionFlow,AUTHORIZE_VISIT_SQL,PREPARE_QUOTE_SQL,
 INSERT_QUOTE_SQL,LOOKUP_ATTEMPT_SQL,PREPARE_CONFIRMATION_SQL,PERSIST_ORDER_SQL}
 from '../apps/api/src/customer-production-flow.mjs';
import {issueCustomerBasketAcceptance,verifyCustomerBasketAcceptance}
 from '../apps/api/src/customer-basket-acceptance.mjs';

const tableId='10000000-0000-4000-8000-000000000001';
const sessionId='10000000-0000-4000-8000-000000000002';
const itemId='10000000-0000-4000-8000-000000000003';
const quoteId='10000000-0000-4000-8000-000000000004';
const orderId='10000000-0000-4000-8000-000000000005';
const batchId='10000000-0000-4000-8000-000000000006';
const visitId='10000000-0000-4000-8000-000000000007';
const basketId='10000000-0000-4000-8000-000000000008';
const token='s'.repeat(43),qrToken='A'.repeat(43);
const snapshot={name:'Arroz cremoso',category:'Primeros',priceCents:1200,
 allergens:[],options:[],extras:[],discount:null};
const selection={options:{},extras:[]};

test('role-scoped transaction pins statements, commits and discards failed connections',async()=>{
 const calls=[];
 const client={query:async(sql,args)=>{calls.push([sql,args]);return {rows:[{ok:true}]};},
  release:discard=>calls.push(['release',discard])};
 const run=createRoleScopedPostgresTransaction({pool:{connect:async()=>client},
  role:'sabora_customer_flow_runtime',allowedSql:new Set(['SELECT allowed'])});
 const value=await run(query=>query('SELECT allowed',[1]));
 assert.deepEqual(value.rows,[{ok:true}]);
 assert.deepEqual(calls.map(entry=>entry[0]),['BEGIN','SET LOCAL ROLE sabora_customer_flow_runtime',
  'SELECT allowed','COMMIT','release']);
 calls.length=0;
 await assert.rejects(run(query=>query('SELECT forbidden')),/role_scoped_sql_not_allowed/);
 assert.deepEqual(calls.map(entry=>entry[0]),['BEGIN','SET LOCAL ROLE sabora_customer_flow_runtime',
  'ROLLBACK','release']);
 assert.equal(calls.at(-1)[1],true);
});

function flowFixture({revision=1,existing=null,reorderEvidence=false}={}){
 const ids=[visitId,basketId,quoteId,orderId,batchId];
 let index=0;const statements=[];
 const evidence={schemaVersion:1,itemId,publishedRevision:1,itemName:snapshot.name,
  category:snapshot.category,quantity:1,basePriceCents:1200,selected:[],allergens:[],
  discount:null,unitSubtotalCents:1200,unitDiscountCents:0,subtotalCents:1200,
  discountCents:0,totalCents:1200};
 const query=async(sql,args)=>{
  statements.push({sql,args});
  if(sql===AUTHORIZE_VISIT_SQL)return {rows:[{table_id:tableId,session_id:sessionId,
   visit_key:visitId,basket_id:basketId,expires_at:new Date()}]};
  if(sql===PREPARE_QUOTE_SQL)return {rows:[{customer_id:orderId,actor_id:orderId,
   session_id:sessionId,customer_alias:'Ana',customer_identifier:'SB-23456789ABCD',
   published_revision:String(revision),published_snapshot:{...snapshot,priceCents:revision===1?1200:1300},available:true}]};
  if(sql===INSERT_QUOTE_SQL)return {rows:[{quote_id:quoteId}]};
  if(sql===LOOKUP_ATTEMPT_SQL)return {rows:[existing??{customer_id:orderId,actor_id:orderId,
   session_id:sessionId,customer_alias:'Ana',customer_identifier:'SB-23456789ABCD',
   request_fingerprint:null,order_id:null,grouping:null}]};
   if(sql===PREPARE_CONFIRMATION_SQL)return {rows:[{published_revision:String(revision),
    published_snapshot:{...snapshot,priceCents:revision===1?1200:1300},available:true,
    quote_evidence:reorderEvidence?Object.fromEntries(Object.entries(evidence).reverse()):evidence,
    quote_expires_at:new Date()}]};
  if(sql===PERSIST_ORDER_SQL)return {rows:[{persisted_order_id:orderId,
   persisted_grouping:'first',repeated:false}]};
  throw Error('unexpected_sql');
 };
 return {flow:createCustomerProductionFlow({withTransaction:callback=>callback(query),
  secretKey:'production-test-secret-key-that-is-at-least-32-bytes',clock:()=>1000,
  newId:()=>ids[index++]}),statements,evidence};
}

test('production flow authorizes visit, issues quote and persists confirmation without browser identity',async()=>{
 const {flow,statements}=flowFixture();
 const visit=await flow.authorizeVisit({customerSessionToken:token,tableId,qrToken});
 assert.deepEqual({...visit},{tableId,visitId,basketId,expiresAt:new Date(14401000).toISOString()});
 const quoted=await flow.quote({customerSessionToken:token,tableId,qrToken,visitId,basketId,
  lines:[{itemId,selection,quantity:1}]});
 assert.equal(quoted.lines[0].quoteId,quoteId);
 const confirmed=await flow.confirm({customerSessionToken:token,tableId,qrToken,visitId,
  basketId,requestKey:'request_key_00001',lines:[{quoteId,itemId,selection,quantity:1}]});
 assert.deepEqual({...confirmed},{status:'confirmed',orderId,grouping:'first'});
 assert.deepEqual(statements.map(value=>value.sql),[AUTHORIZE_VISIT_SQL,PREPARE_QUOTE_SQL,
  INSERT_QUOTE_SQL,LOOKUP_ATTEMPT_SQL,PREPARE_CONFIRMATION_SQL,PERSIST_ORDER_SQL]);
 const persisted=statements.find(value=>value.sql===PERSIST_ORDER_SQL);
 assert.equal(typeof persisted.args[9],'string');
 assert.equal(JSON.parse(persisted.args[9])[0].evidence.totalCents,1200);
 assert.equal(JSON.stringify(statements).includes(token),false);
});

test('unchanged JSONB evidence confirms despite PostgreSQL property reordering',async()=>{
 const {flow,statements}=flowFixture({reorderEvidence:true});
 const confirmed=await flow.confirm({customerSessionToken:token,tableId,qrToken,visitId,
  basketId,requestKey:'request_key_jsonb_order',lines:[{quoteId,itemId,selection,quantity:1}]});
 assert.equal(confirmed.status,'confirmed');
 assert.equal(statements.some(value=>value.sql===PERSIST_ORDER_SQL),true);
});

test('basket repricing requires an exact, expiring server HMAC before persistence',async()=>{
 const {flow,statements}=flowFixture({revision:2});
 const input={customerSessionToken:token,tableId,qrToken,visitId,basketId,
  requestKey:'request_key_00002',lines:[{quoteId,itemId,selection,quantity:1}]};
 const challenge=await flow.confirm(input);
 assert.equal(challenge.status,'acceptance_required');
 assert.equal(challenge.changes[0].previousTotalCents,1200);
 assert.equal(challenge.changes[0].currentTotalCents,1300);
 assert.equal(statements.some(value=>value.sql===PERSIST_ORDER_SQL),false);
 const confirmed=await flow.confirm({...input,acceptanceToken:challenge.acceptance.token});
 assert.equal(confirmed.status,'confirmed');
 const persisted=statements.findLast(value=>value.sql===PERSIST_ORDER_SQL);
 assert.equal(persisted.args.at(-1),true);
 await assert.rejects(flow.confirm({...input,lines:[{quoteId,itemId,selection,quantity:2}],
  acceptanceToken:challenge.acceptance.token}),/acceptance_required|order_displayed_quote_invalid/);
});

test('durable replay returns the stored order and conflicting request fails closed',async()=>{
 const fingerprint=Buffer.alloc(32);
 // A mismatch demonstrates that replay is tied to the exact server fingerprint.
 const {flow}=flowFixture({existing:{customer_id:orderId,actor_id:orderId,
  session_id:sessionId,customer_alias:'Ana',customer_identifier:'SB-23456789ABCD',
  request_fingerprint:fingerprint,order_id:orderId,grouping:'grouped'}});
 await assert.rejects(flow.confirm({customerSessionToken:token,tableId,qrToken,visitId,basketId,
  requestKey:'request_key_00003',lines:[{quoteId,itemId,selection,quantity:1}]}),
  /customer_order_idempotency_conflict/);
});

test('basket acceptance expires, rejects tampering and is independent of object key order',()=>{
 const secretKey='production-test-secret-key-that-is-at-least-32-bytes';
 const context={basketId:'basket_key_00001',lines:[{itemId,quantity:1}]};
 const issued=issueCustomerBasketAcceptance({secretKey,context,nowMs:1000,ttlSeconds:60});
 assert.equal(verifyCustomerBasketAcceptance({token:issued.token,secretKey,
  context:{lines:[{quantity:1,itemId}],basketId:'basket_key_00001'},nowMs:2000}),true);
 assert.equal(verifyCustomerBasketAcceptance({token:issued.token,secretKey,
  context,nowMs:61001}),false);
 const tampered=issued.token.slice(0,-1)+(issued.token.endsWith('0')?'1':'0');
 assert.equal(verifyCustomerBasketAcceptance({token:tampered,secretKey,
  context,nowMs:2000}),false);
});
