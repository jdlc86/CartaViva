import test from 'node:test';
import assert from 'node:assert/strict';
import {createCatalogConfirmationReadRepository} from '../apps/api/src/catalog-confirmation-read-repository.mjs';
const tableId='00000000-0000-4000-8000-000000000001';
const sessionId='00000000-0000-4000-8000-000000000002';
const itemId='00000000-0000-4000-8000-000000000003';
const quoteId='00000000-0000-4000-8000-000000000004';
const orderId='00000000-0000-4000-8000-000000000005';
const context={authorized:true,canOrder:true,tableId,sessionId,visitId:'visit-1',basketId:'basket-1',actorId:'actor-1'};
const repo=createCatalogConfirmationReadRepository();
test('scoped idempotency lookup binds all six fields and locks existing row',async()=>{
 const calls=[];
 const result=await repo.lookupIdempotency(async(sql,args)=>{
  calls.push({sql,args});return {rows:[{request_fingerprint:'fingerprint',order_id:orderId}]};
 },{context,requestKey:'request-001',requestFingerprint:'fingerprint'});
 assert.deepEqual(result,{requestFingerprint:'fingerprint',result:{orderId}});
 assert.equal(calls.length,2);
 assert.match(calls[0].sql,/pg_advisory_xact_lock/);
 assert.deepEqual(JSON.parse(calls[0].args[0]),
  [tableId,sessionId,'visit-1','basket-1','actor-1','request-001']);
 assert.deepEqual(calls[1].args,[tableId,sessionId,'visit-1','basket-1','actor-1','request-001']);
 assert.match(calls[1].sql,/FOR UPDATE/);
 assert.doesNotMatch(calls[1].sql,/request-001/);
});
test('missing idempotency record is not a replay',async()=>{
 assert.equal(await repo.lookupIdempotency(async()=>({rows:[]}),
  {context,requestKey:'request-001',requestFingerprint:'fingerprint'}),null);
});
test('catalog locks publication and refuses sold out or withdrawn',async()=>{
 for(const extra of [{sold_out:true,withdrawn_at:null},
   {sold_out:false,withdrawn_at:'2026-10-22'}]){
  const result=await repo.lockCatalog(async(sql,args)=>{
   assert.match(sql,/FOR SHARE/);assert.deepEqual(args,[itemId]);
   return {rows:[{published_revision:'4',published_snapshot:{priceCents:1000},...extra}]};
  },{context,itemId});
  assert.equal(result.available,false);
 }
 const active=await repo.lockCatalog(async()=>({rows:[{
  published_revision:'4',published_snapshot:{priceCents:1000},withdrawn_at:null,sold_out:false
 }]}),{context,itemId});
 assert.equal(active.available,true);
 assert.equal(active.publishedRevision,4);
});
test('trusted previous quote is scoped, unexpired, locked and checked',async()=>{
 const quote=await repo.loadPreviousQuote(async(sql,args)=>{
  assert.match(sql,/expires_at>clock_timestamp\(\)/);
  assert.match(sql,/FOR SHARE/);
  assert.deepEqual(args,[tableId,sessionId,'visit-1','basket-1','actor-1',itemId]);
  return {rows:[{id:quoteId,published_revision:'3',subtotal_cents:'1200',
   discount_cents:'200',total_cents:'1000',evidence:{schemaVersion:1}}]};
 },{context,itemId});
 assert.deepEqual(quote,{quoteId,evidence:{schemaVersion:1},publishedRevision:3,subtotalCents:1200,
  discountCents:200,totalCents:1000});
});
test('no quote and malformed economic record fail closed',async()=>{
 assert.equal(await repo.loadPreviousQuote(async()=>({rows:[]}),{context,itemId}),null);
 await assert.rejects(repo.loadPreviousQuote(async()=>({rows:[{
  id:quoteId,published_revision:'3',subtotal_cents:'1200',
  discount_cents:'200',total_cents:'1001'
 }]}),{context,itemId}),/invalid_catalog_repository_response/);
 await assert.rejects(repo.loadPreviousQuote(async()=>({rows:[{
  id:quoteId,published_revision:'3',subtotal_cents:'9007199254740993',
  discount_cents:'0',total_cents:'9007199254740993'
 }]}),{context,itemId}),/invalid_catalog_repository_response/);
});
test('invalid scopes and unexpected duplicate rows never pass',async()=>{
 const query=async()=>({rows:[]});
 await assert.rejects(repo.loadPreviousQuote(query,{context:{...context,actorId:'bad value'},itemId}),
  /invalid_catalog_repository_scope/);
 await assert.rejects(repo.lookupIdempotency(query,{context,requestKey:'short'}),
  /invalid_catalog_repository_scope/);
 await assert.rejects(repo.lockCatalog(async()=>({rows:[{},{}]}),{context,itemId}),
  /invalid_catalog_repository_response/);
});

test('idempotency lookup rejects absent and oversized request fingerprints before SQL',async()=>{
 let calls=0;
 const query=async()=>{calls++;return {rows:[]};};
 for(const fingerprint of [undefined,'','x'.repeat(16385)]){
  await assert.rejects(repo.lookupIdempotency(query,{
   context,requestKey:'request-001',requestFingerprint:fingerprint
  }),/invalid_catalog_repository_scope/);
 }
 assert.equal(calls,0);
});

test('corrupt persisted replay fingerprint is rejected',async()=>{
 for(const fingerprint of ['', 'x'.repeat(16385)]){
  await assert.rejects(repo.lookupIdempotency(async()=>({rows:[{
   request_fingerprint:fingerprint,order_id:orderId
  }]}),{context,requestKey:'request-001',requestFingerprint:'fingerprint'}),
  /invalid_catalog_repository_response/);
 }
});

test('every SQL confirmation reader refuses unauthorized or paused visit scope before query',async()=>{
 let calls=0;
 const query=async()=>{calls++;return {rows:[]};};
 for(const patch of [{authorized:false},{canOrder:false},{authorized:undefined}]){
  const invalid={...context,...patch};
  await assert.rejects(repo.lookupIdempotency(query,{
   context:invalid,requestKey:'request-001',requestFingerprint:'fingerprint'
  }),/invalid_catalog_repository_scope/);
  await assert.rejects(repo.lockCatalog(query,{context:invalid,itemId}),
   /invalid_catalog_repository_scope/);
  await assert.rejects(repo.loadPreviousQuote(query,{context:invalid,itemId}),
   /invalid_catalog_repository_scope/);
 }
 assert.equal(calls,0);
});

test('scoped advisory lock separates request keys, sessions and actors',async()=>{
 const locks=[];
 for(const [ctx,key] of [
  [context,'request-001'],[context,'request-002'],
  [{...context,sessionId:'00000000-0000-4000-8000-000000000006'},'request-001'],
  [{...context,actorId:'actor-2'},'request-001']
 ]){
  await repo.lookupIdempotency(async(sql,args)=>{
   if(sql.includes('pg_advisory_xact_lock'))locks.push(args[0]);
   return {rows:[]};
  },{context:ctx,requestKey:key,requestFingerprint:'fingerprint'});
 }
 assert.equal(new Set(locks).size,4);
});

test('numeric evidence cannot use JavaScript coercion of null blank or exponent values',async()=>{
 for(const invalid of [null,'','  ','1e3','+1000','01',-1,1.5,{},'9007199254740993']){
  const baseline={id:quoteId,published_revision:'3',subtotal_cents:'1000',
   discount_cents:'0',total_cents:'1000',evidence:{schemaVersion:1}};
  for(const field of ['published_revision','subtotal_cents','discount_cents','total_cents']){
   await assert.rejects(repo.loadPreviousQuote(async()=>({rows:[{...baseline,[field]:invalid}]}),
    {context,itemId}),/invalid_catalog_repository_response/);
  }
 }
});

test('catalog revision refuses coercible but noncanonical database values',async()=>{
 for(const revision of [null,'',' ','1e2','01','+1',{},1.5]){
  const result=await repo.lockCatalog(async()=>({rows:[{
   published_revision:revision,published_snapshot:{priceCents:1000},
   withdrawn_at:null,sold_out:false
  }]}),{context,itemId});
  assert.equal(result.available,false);
 }
});

test('malformed advisory lock responses abort before any ledger lookup',async()=>{
 for(const response of [null,undefined,{}, {rows:null},{rows:'bad'}]){
  const statements=[];
  await assert.rejects(repo.lookupIdempotency(async sql=>{
   statements.push(sql);
   return response;
  },{context,requestKey:'request-001',requestFingerprint:'fingerprint'}),
  /invalid_catalog_repository_response/);
  assert.equal(statements.length,1);
  assert.match(statements[0],/pg_advisory_xact_lock/);
 }
});

test('advisory lock SQL errors propagate without attempting idempotency read',async()=>{
 const statements=[];
 await assert.rejects(repo.lookupIdempotency(async sql=>{
  statements.push(sql);
  throw Error('advisory_lock_unavailable');
 },{context,requestKey:'request-001',requestFingerprint:'fingerprint'}),
 /advisory_lock_unavailable/);
 assert.equal(statements.length,1);
});

test('valid void-style advisory lock response proceeds to scoped ledger lookup',async()=>{
 const statements=[];
 const result=await repo.lookupIdempotency(async sql=>{
  statements.push(sql);
  return sql.includes('pg_advisory_xact_lock')?{rows:[{pg_advisory_xact_lock:null}]}:{rows:[]};
 },{context,requestKey:'request-001',requestFingerprint:'fingerprint'});
 assert.equal(result,null);
 assert.equal(statements.length,2);
});

test('advisory lock response cannot contain multiple rows',async()=>{
 let calls=0;
 await assert.rejects(repo.lookupIdempotency(async()=>{
  calls++;
  return {rows:[{},{}]};
 },{context,requestKey:'request-001',requestFingerprint:'fingerprint'}),
 /invalid_catalog_repository_response/);
 assert.equal(calls,1);
});

test('malicious numeric objects and symbols never invoke user-defined coercion',async()=>{
 let coercions=0;
 const hostile={valueOf(){coercions++;throw Error('unsafe_numeric_coercion');},
  toString(){coercions++;throw Error('unsafe_numeric_coercion');}};
 const baseline={id:quoteId,published_revision:'3',subtotal_cents:'1000',
  discount_cents:'0',total_cents:'1000',evidence:{schemaVersion:1}};
 for(const value of [Symbol('db-number'),hostile,[],true]){
  const catalog=await repo.lockCatalog(async()=>({rows:[{
   published_revision:value,published_snapshot:{priceCents:1000},
   withdrawn_at:null,sold_out:false
  }]}),{context,itemId});
  assert.equal(catalog.available,false);
  for(const field of ['published_revision','subtotal_cents','discount_cents','total_cents']){
   await assert.rejects(repo.loadPreviousQuote(async()=>({rows:[{
    ...baseline,[field]:value
   }]}),{context,itemId}),error=>{
    assert.equal(error.message,'invalid_catalog_repository_response');
    return true;
   });
  }
 }
 assert.equal(coercions,0);
});

test('malformed non-object SQL rows are not interpreted as absent catalog or quote',async()=>{
 for(const malformed of [null,undefined,false,0,'',[],['unexpected']]){
  let calls=0;
  const query=async()=>{calls++;return {rows:[malformed]};};
  await assert.rejects(repo.lockCatalog(query,{context,itemId}),
   /invalid_catalog_repository_response/);
  await assert.rejects(repo.loadPreviousQuote(query,{context,itemId}),
   /invalid_catalog_repository_response/);
  assert.equal(calls,2);
 }
});

test('malformed idempotency ledger row aborts rather than creating another order',async()=>{
 for(const malformed of [null,false,0,'',[]]){
  let calls=0;
  await assert.rejects(repo.lookupIdempotency(async()=>{
   calls++;
   return calls===1?{rows:[]}:{rows:[malformed]};
  },{context,requestKey:'request-001',requestFingerprint:'fingerprint'}),
   /invalid_catalog_repository_response/);
  assert.equal(calls,2);
 }
});

test('malformed single-row advisory lock responses fail before ledger read',async()=>{
 for(const malformed of [null,undefined,false,0,'',[],['invalid']]){
  let calls=0;
  await assert.rejects(repo.lookupIdempotency(async()=>{
   calls++;
   return {rows:[malformed]};
  },{context,requestKey:'request-001',requestFingerprint:'fingerprint'}),
  /invalid_catalog_repository_response/);
  assert.equal(calls,1);
 }
});

test('all catalog readers reject accessor-backed, inherited and dangerous scope before SQL',async()=>{
 let getters=0,sqlCalls=0;
 const query=async()=>{sqlCalls++;throw Error('unexpected_SQL');};
 const accessor={...context};
 Object.defineProperty(accessor,'authorized',{enumerable:true,
  get(){getters++;throw Error('untrusted_getter');}});
 const inherited=Object.assign(Object.create({inherited:true}),context);
 const dangerous={...context};
 Object.defineProperty(dangerous,'__proto__',{enumerable:true,value:'malicious'});
 for(const invalid of [accessor,inherited,dangerous]){
  await assert.rejects(repo.lookupIdempotency(query,{
   context:invalid,requestKey:'request-001',requestFingerprint:'fingerprint'
  }),/invalid_catalog_repository_scope/);
  await assert.rejects(repo.lockCatalog(query,{context:invalid,itemId}),
   /invalid_catalog_repository_scope/);
  await assert.rejects(repo.loadPreviousQuote(query,{context:invalid,itemId}),
   /invalid_catalog_repository_scope/);
 }
 assert.equal(getters,0);
 assert.equal(sqlCalls,0);
});

test('catalog row decoding rejects accessor-backed and inherited SQL rows before field reads',async()=>{
 let getterCalls=0;
 const baseline={id:quoteId,published_revision:'3',subtotal_cents:'1000',
  discount_cents:'0',total_cents:'1000',evidence:{schemaVersion:1},
  published_snapshot:{priceCents:1000},withdrawn_at:null,sold_out:false,
  request_fingerprint:'fingerprint',order_id:orderId};
 const accessor={...baseline};
 Object.defineProperty(accessor,'published_revision',{enumerable:true,
  get(){getterCalls++;throw Error('malicious_row_getter');}});
 const inherited=Object.assign(Object.create({inherited:true}),baseline);
 for(const badRow of [accessor,inherited]){
  const query=async sql=>sql.includes('pg_advisory_xact_lock')?
   {rows:[]}:{rows:[badRow]};
  await assert.rejects(repo.lookupIdempotency(query,{
   context,requestKey:'request-001',requestFingerprint:'fingerprint'
  }),/invalid_catalog_repository_response/);
  await assert.rejects(repo.lockCatalog(query,{context,itemId}),
   /invalid_catalog_repository_response/);
  await assert.rejects(repo.loadPreviousQuote(query,{context,itemId}),
   /invalid_catalog_repository_response/);
 }
 assert.equal(getterCalls,0);
});

test('nested publication and quote evidence reject accessor and inherited records',async()=>{
 let getters=0;
 const accessor={priceCents:1000};
 Object.defineProperty(accessor,'discount',{enumerable:true,
  get(){getters++;throw Error('unexpected_nested_getter');}});
 const inherited=Object.assign(Object.create({unexpected:true}),{priceCents:1000});
 const dangerous={priceCents:1000};
 Object.defineProperty(dangerous,'__proto__',{enumerable:true,value:1});
 for(const nested of [accessor,inherited,dangerous]){
  const catalog=await repo.lockCatalog(async()=>({rows:[{
   published_revision:'3',published_snapshot:nested,withdrawn_at:null,sold_out:false
  }]}),{context,itemId});
  assert.equal(catalog.available,false);
  await assert.rejects(repo.loadPreviousQuote(async()=>({rows:[{
   id:quoteId,published_revision:'3',subtotal_cents:'1000',
   discount_cents:'0',total_cents:'1000',evidence:nested
  }]}),{context,itemId}),/invalid_catalog_repository_response/);
 }
 assert.equal(getters,0);
});

test('catalog reader argument records reject getters and inherited properties before SQL',async()=>{
 let getters=0,sqlCalls=0;
 const query=async()=>{sqlCalls++;throw Error('unexpected_SQL');};
 const good={context,itemId,requestKey:'request-001',requestFingerprint:'fingerprint'};
 const accessor={...good};
 Object.defineProperty(accessor,'context',{enumerable:true,get(){
  getters++;throw Error('argument_getter');
 }});
 const inherited=Object.assign(Object.create({unsafe:true}),good);
 const dangerous={...good};
 Object.defineProperty(dangerous,'__proto__',{enumerable:true,value:1});
 for(const args of [accessor,inherited,dangerous]){
  await assert.rejects(repo.lookupIdempotency(query,args),/invalid_catalog_repository_scope/);
  await assert.rejects(repo.lockCatalog(query,args),/invalid_catalog_repository_scope/);
  await assert.rejects(repo.loadPreviousQuote(query,args),/invalid_catalog_repository_scope/);
 }
 assert.equal(getters,0);
 assert.equal(sqlCalls,0);
});

test('advisory lock rejects accessor-backed and inherited response rows before ledger read',async()=>{
 let getters=0;
 const accessor={};
 Object.defineProperty(accessor,'pg_advisory_xact_lock',{enumerable:true,get(){
  getters++;throw Error('advisory_getter');
 }});
 const inherited=Object.assign(Object.create({unsafe:true}),{pg_advisory_xact_lock:null});
 const dangerous={pg_advisory_xact_lock:null};
 Object.defineProperty(dangerous,'__proto__',{enumerable:true,value:1});
 for(const row of [accessor,inherited,dangerous]){
  let queries=0;
  await assert.rejects(repo.lookupIdempotency(async()=>{
   queries++;return {rows:[row]};
  },{context,requestKey:'request-001',requestFingerprint:'fingerprint'}),
  /invalid_catalog_repository_response/);
  assert.equal(queries,1);
 }
 assert.equal(getters,0);
});

test('idempotency lookup rejects malformed lock responses before ledger access',async()=>{
 for(const response of [null,{}, {rows:null},{rows:[{},{}]},
  {rows:[null]},{rows:[{get request_fingerprint(){throw Error('getter');}}]}]){
  let calls=0;
  await assert.rejects(repo.lookupIdempotency(async()=>{
   calls++;return response;
  },{context,requestKey:'request-001',requestFingerprint:'fingerprint'}),
  /invalid_catalog_repository_response/);
  assert.equal(calls,1);
 }
});
test('idempotency ledger rejects forged or malformed durable replay rows',async()=>{
 for(const record of [
  {request_fingerprint:'fingerprint',order_id:'not-uuid'},
  {request_fingerprint:'',order_id:orderId},
  {request_fingerprint:'x'.repeat(16385),order_id:orderId},
  {request_fingerprint:42,order_id:orderId},
  {request_fingerprint:'fingerprint',order_id:null},
  Object.create({request_fingerprint:'fingerprint',order_id:orderId})
 ]){
  let calls=0;
  await assert.rejects(repo.lookupIdempotency(async()=>{
   calls++;
   return calls===1?{rows:[{}]}:{rows:[record]};
  },{context,requestKey:'request-001',requestFingerprint:'fingerprint'}),
  /invalid_catalog_repository_response/);
  assert.equal(calls,2);
 }
});
test('idempotency lock scope changes independently for each identity dimension',async()=>{
 const base=[tableId,sessionId,'visit-1','basket-1','actor-1','request-001'];
 const variants=[
  [{...context,tableId:'00000000-0000-4000-8000-000000000011'},'request-001',0],
  [{...context,sessionId:'00000000-0000-4000-8000-000000000012'},'request-001',1],
  [{...context,visitId:'visit-2'},'request-001',2],
  [{...context,basketId:'basket-2'},'request-001',3],
  [{...context,actorId:'actor-2'},'request-001',4],
  [context,'request-002',5]
 ];
 for(const [scope,key,index] of variants){
  let captured;
  await repo.lookupIdempotency(async(sql,args)=>{
   if(sql.includes('pg_advisory_xact_lock'))captured=JSON.parse(args[0]);
   return {rows:[]};
  },{context:scope,requestKey:key,requestFingerprint:'fingerprint'});
  assert.equal(captured.length,6);
  assert.notEqual(captured[index],base[index]);
  assert.deepEqual(captured.filter((_,i)=>i!==index),
   base.filter((_,i)=>i!==index));
 }
});
