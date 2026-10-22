import test from 'node:test';
import assert from 'node:assert/strict';
import { createPostgresTransaction } from '../apps/api/src/postgres-transaction.mjs';
function fakePool(failOn) {
 const calls=[];
 let releases=0;
 const client={query:async(sql,args)=>{calls.push([sql,args]);if(sql===failOn)throw Error('query failed');return {rows:[]};},release:()=>{releases++}};
 return {pool:{connect:async()=>client},calls,releases:()=>releases};
}
test('BEGIN, work and COMMIT use same checked-out connection',async()=>{
 const fixture=fakePool();
 const transaction=createPostgresTransaction({pool:fixture.pool});
 await transaction(async query=>{await query('SELECT $1',[7]);return 42}).then(value=>assert.equal(value,42));
 assert.deepEqual(fixture.calls.map(([sql])=>sql),['BEGIN','SELECT $1','COMMIT']);
 assert.deepEqual(fixture.calls[1][1],[7]);
 assert.equal(fixture.releases(),1);
});
test('failure rolls back and releases connection',async()=>{
 const fixture=fakePool('UPDATE x');
 const transaction=createPostgresTransaction({pool:fixture.pool});
 await assert.rejects(transaction(query=>query('UPDATE x')),/query failed/);
 assert.deepEqual(fixture.calls.map(([sql])=>sql),['BEGIN','UPDATE x','ROLLBACK']);
 assert.equal(fixture.releases(),1);
});
test('BEGIN failure never issues rollback and still releases',async()=>{
 const fixture=fakePool('BEGIN');
 await assert.rejects(createPostgresTransaction({pool:fixture.pool})(async()=>{}),/query failed/);
 assert.deepEqual(fixture.calls.map(([sql])=>sql),['BEGIN']);
 assert.equal(fixture.releases(),1);
});

test('rollback failure discards connection and preserves original error',async()=>{
 const releases=[];
 const client={
  query:async sql=>{
   if(sql==='UPDATE x')throw Error('original mutation failure');
   if(sql==='ROLLBACK')throw Error('rollback failure');
   return {rows:[]};
  },
  release:error=>releases.push(error)
 };
 const transaction=createPostgresTransaction({pool:{connect:async()=>client}});
 await assert.rejects(transaction(query=>query('UPDATE x')),error=>{
  assert.match(error.message,/original mutation failure/);
  assert.match(error.rollbackError?.message??'',/rollback failure/);
  return true;
 });
 assert.equal(releases.length,1);
 assert.match(releases[0]?.message??'',/rollback failure/);
});
test('failed BEGIN discards connection instead of returning uncertain session to pool',async()=>{
 const releases=[];
 const transaction=createPostgresTransaction({pool:{connect:async()=>({
  query:async()=>{throw Error('begin failure')},
  release:error=>releases.push(error)
 })}});
 await assert.rejects(transaction(async()=>{}),/begin failure/);
 assert.equal(releases.length,1);
 assert.match(releases[0]?.message??'',/begin failure/);
});
test('failed COMMIT attempts rollback, discards uncertain client and propagates failure',async()=>{
 const statements=[];
 const releases=[];
 const transaction=createPostgresTransaction({pool:{connect:async()=>({
  query:async sql=>{statements.push(sql);if(sql==='COMMIT')throw Error('commit failure');return {rows:[]}},
  release:error=>releases.push(error)
 })}});
 await assert.rejects(transaction(async()=>17),/commit failure/);
 assert.deepEqual(statements,['BEGIN','COMMIT','ROLLBACK']);
 assert.equal(releases.length,1);
 assert.match(releases[0]?.message??'',/commit failure/);
});

test('ordinary work failure with successful rollback returns clean client to pool',async()=>{
 const releases=[];
 const statements=[];
 const transaction=createPostgresTransaction({pool:{connect:async()=>({
  query:async sql=>{
   statements.push(sql);
   if(sql==='UPDATE x')throw Error('work failure');
   return {rows:[]};
  },
  release:error=>releases.push(error)
 })}});
 await assert.rejects(transaction(query=>query('UPDATE x')),/work failure/);
 assert.deepEqual(statements,['BEGIN','UPDATE x','ROLLBACK']);
 assert.deepEqual(releases,[undefined]);
});

test('failed COMMIT and failed rollback preserve original error and discard client',async()=>{
 const releases=[];
 const statements=[];
 const transaction=createPostgresTransaction({pool:{connect:async()=>({
  query:async sql=>{
   statements.push(sql);
   if(sql==='COMMIT')throw Error('commit uncertain');
   if(sql==='ROLLBACK')throw Error('rollback unavailable');
   return {rows:[]};
  },
  release:error=>releases.push(error)
 })}});
 await assert.rejects(transaction(async()=>42),error=>{
  assert.equal(error.message,'commit uncertain');
  assert.equal(error.rollbackError?.message,'rollback unavailable');
  return true;
 });
 assert.deepEqual(statements,['BEGIN','COMMIT','ROLLBACK']);
 assert.equal(releases.length,1);
 assert.equal(releases[0]?.message,'rollback unavailable');
});

test('a query capability retained by the callback cannot be used after commit',async()=>{
 const fixture=fakePool();
 let leakedQuery;
 const withTransaction=createPostgresTransaction({pool:fixture.pool});
 await withTransaction(async query=>{leakedQuery=query;await query('SELECT 1');});
 await assert.rejects(leakedQuery('DELETE FROM sabora.dining_tables'),
  /transaction_scope_closed/);
 assert.deepEqual(fixture.calls.map(([sql])=>sql),['BEGIN','SELECT 1','COMMIT']);
 assert.equal(fixture.releases(),1);
});

test('a query capability retained by a failed callback cannot run after rollback',async()=>{
 const fixture=fakePool();
 let leakedQuery;
 const withTransaction=createPostgresTransaction({pool:fixture.pool});
 await assert.rejects(withTransaction(async query=>{
  leakedQuery=query;
  throw Error('abort_work');
 }),/abort_work/);
 await assert.rejects(leakedQuery('UPDATE sabora.dining_tables SET number=1'),
  /transaction_scope_closed/);
 assert.deepEqual(fixture.calls.map(([sql])=>sql),['BEGIN','ROLLBACK']);
 assert.equal(fixture.releases(),1);
});

test('detached query cannot cross COMMIT; rollback waits for it and discards connection',async()=>{
 const statements=[];
 const releases=[];
 let resolveQuery;
 let started;
 const queryStarted=new Promise(resolve=>{started=resolve;});
 const client={
  query:async sql=>{
   statements.push(sql);
   if(sql==='SELECT slow'){
    const gate=new Promise(resolve=>{resolveQuery=resolve;});
    started();
    await gate;
   }
   return {rows:[]};
  },
  release:reason=>releases.push(reason)
 };
 const withTransaction=createPostgresTransaction({pool:{connect:async()=>client}});
 const pending=withTransaction(async query=>{
  void query('SELECT slow');
  await queryStarted;
  return 'must-not-commit';
 });
 await queryStarted;
 assert.equal(statements.includes('COMMIT'),false);
 resolveQuery();
 await assert.rejects(pending,/transaction_queries_not_awaited/);
 assert.deepEqual(statements,['BEGIN','SELECT slow','ROLLBACK']);
 assert.equal(releases.length,1);
 assert.match(releases[0]?.message??'',/transaction_queries_not_awaited/);
});

test('retained query is revoked while COMMIT is still pending',async()=>{
 let releaseCommit;
 let commitStarted;
 const commitEntered=new Promise(resolve=>{commitStarted=resolve;});
 const statements=[];
 const client={
  query:async sql=>{
   statements.push(sql);
   if(sql==='COMMIT'){
    const gate=new Promise(resolve=>{releaseCommit=resolve;});
    commitStarted();
    await gate;
   }
   return {rows:[]};
  },
  release:()=>{}
 };
 let retained;
 const withTransaction=createPostgresTransaction({pool:{connect:async()=>client}});
 const pending=withTransaction(async query=>{retained=query;return 'ok';});
 await commitEntered;
 await assert.rejects(retained('SELECT after work'),/transaction_scope_closed/);
 releaseCommit();
 assert.equal(await pending,'ok');
 assert.deepEqual(statements,['BEGIN','COMMIT']);
});

test('detached query failure still rolls back without committing',async()=>{
 const statements=[];
 let started;
 const queryStarted=new Promise(resolve=>{started=resolve;});
 const client={
  query:async sql=>{
   statements.push(sql);
   if(sql==='SELECT rejected'){
    started();
    throw Error('detached_db_failure');
   }
   return {rows:[]};
  },
  release:()=>{}
 };
 const withTransaction=createPostgresTransaction({pool:{connect:async()=>client}});
 await assert.rejects(withTransaction(async query=>{
  const detached=query('SELECT rejected');
  await queryStarted;
  await assert.rejects(detached,/detached_db_failure/);
  throw Error('work_failed');
 }),/work_failed/);
 assert.deepEqual(statements,['BEGIN','SELECT rejected','ROLLBACK']);
});

test('malformed checked-out client with release is discarded before BEGIN',async()=>{
 const reasons=[];
 const client={release:reason=>reasons.push(reason)};
 const transaction=createPostgresTransaction({pool:{connect:async()=>client}});
 await assert.rejects(transaction(async()=>{}),/invalid_transaction_client/);
 assert.equal(reasons.length,1);
 assert.match(reasons[0]?.message??'',/invalid_transaction_client/);
});

test('malformed checked-out client with throwing release preserves validation error',async()=>{
 let attempts=0;
 const client={release:()=>{attempts++;throw Error('release_failure');}};
 const transaction=createPostgresTransaction({pool:{connect:async()=>client}});
 await assert.rejects(transaction(async()=>{}),/invalid_transaction_client/);
 assert.equal(attempts,1);
});

test('null checked-out client is rejected without attempting a transaction',async()=>{
 const transaction=createPostgresTransaction({pool:{connect:async()=>null}});
 await assert.rejects(transaction(async()=>{}),/invalid_transaction_client/);
});

test('release failure cannot mask original SQL failure after successful rollback',async()=>{
 const statements=[];
 const withTransaction=createPostgresTransaction({pool:{connect:async()=>({
  query:async sql=>{
   statements.push(sql);
   if(sql==='UPDATE x')throw Error('original_sql_failure');
   return {rows:[]};
  },
  release:()=>{throw Error('release_failed');}
 })}});
 await assert.rejects(withTransaction(query=>query('UPDATE x')),error=>{
  assert.equal(error.message,'original_sql_failure');
  assert.equal(error.releaseError?.message,'release_failed');
  return true;
 });
 assert.deepEqual(statements,['BEGIN','UPDATE x','ROLLBACK']);
});

test('release failure after successful COMMIT is reported, never a false success',async()=>{
 const statements=[];
 const withTransaction=createPostgresTransaction({pool:{connect:async()=>({
  query:async sql=>{statements.push(sql);return {rows:[]};},
  release:()=>{throw Error('release_failed');}
 })}});
 await assert.rejects(withTransaction(async()=>42),/release_failed/);
 assert.deepEqual(statements,['BEGIN','COMMIT']);
});

test('failed COMMIT and throwing release preserve uncertain commit error',async()=>{
 const statements=[];
 const withTransaction=createPostgresTransaction({pool:{connect:async()=>({
  query:async sql=>{
   statements.push(sql);
   if(sql==='COMMIT')throw Error('commit_uncertain');
   return {rows:[]};
  },
  release:()=>{throw Error('release_failed');}
 })}});
 await assert.rejects(withTransaction(async()=>42),error=>{
  assert.equal(error.message,'commit_uncertain');
  assert.equal(error.releaseError?.message,'release_failed');
  return true;
 });
 assert.deepEqual(statements,['BEGIN','COMMIT','ROLLBACK']);
});

test('throwing release does not mask failed BEGIN',async()=>{
 const statements=[];
 const withTransaction=createPostgresTransaction({pool:{connect:async()=>({
  query:async sql=>{statements.push(sql);throw Error('begin_failed');},
  release:()=>{throw Error('release_failed');}
 })}});
 await assert.rejects(withTransaction(async()=>42),error=>{
  assert.equal(error.message,'begin_failed');
  assert.equal(error.releaseError?.message,'release_failed');
  return true;
 });
 assert.deepEqual(statements,['BEGIN']);
});

test('frozen original error survives failed ROLLBACK and failed release',async()=>{
 const original=Object.freeze(new Error('immutable_original_failure'));
 const releases=[];
 const withTransaction=createPostgresTransaction({pool:{connect:async()=>({
  query:async sql=>{
   if(sql==='ROLLBACK')throw Error('rollback_failed');
   return {rows:[]};
  },
  release:reason=>{releases.push(reason);throw Error('release_failed');}
 })}});
 await assert.rejects(withTransaction(async()=>{throw original;}),error=>{
  assert.equal(error,original);
  assert.equal(error.message,'immutable_original_failure');
  return true;
 });
 assert.equal(releases.length,1);
 assert.equal(releases[0]?.message,'rollback_failed');
});

test('falsy thrown callback values are preserved even if release fails',async()=>{
 for(const thrown of [null,undefined,false,0,'']){
  const statements=[];
  const withTransaction=createPostgresTransaction({pool:{connect:async()=>({
   query:async sql=>{statements.push(sql);return {rows:[]};},
   release:()=>{throw Error('release_failed');}
  })}});
  let rejected=false;
  try{
   await withTransaction(async()=>{throw thrown;});
  }catch(error){
   rejected=true;
   assert.equal(error,thrown);
  }
  assert.equal(rejected,true);
  assert.deepEqual(statements,['BEGIN','ROLLBACK']);
 }
});

test('a detached query cannot enqueue another SQL statement after callback abort',async()=>{
 const statements=[],releases=[];
 let firstStarted,finishFirst;
 const firstEntered=new Promise(resolve=>{firstStarted=resolve;});
 const firstGate=new Promise(resolve=>{finishFirst=resolve;});
 let queryCapability,spawned;
 const client={
  async query(sql){
   statements.push(sql);
   if(sql==='SELECT first'){
    firstStarted();
    await firstGate;
    // A late continuation must not schedule SQL after the scope closes.
    spawned=queryCapability('SELECT second').then(()=>null,error=>error);
   }
   return {rows:[]};
  },
  release:reason=>releases.push(reason)
 };
 const transaction=createPostgresTransaction({pool:{connect:async()=>client}});
 const pending=transaction(async query=>{
  queryCapability=query;
  void query('SELECT first');
  await firstEntered;
  throw Error('abort_with_detached_query');
 });
 await firstEntered;
 // Let the callback failure close the transaction scope before resuming SQL.
 await Promise.resolve();
 finishFirst();
 await assert.rejects(pending,/abort_with_detached_query/);
 assert.match((await spawned)?.message??'',/transaction_scope_closed/);
 assert.deepEqual(statements,['BEGIN','SELECT first','ROLLBACK']);
 assert.equal(releases.length,1);
 assert.match(releases[0]?.message??'',/abort_with_detached_query/);
});

test('transaction rejects query-config objects and invalid parameter containers before driver access',async()=>{
 const statements=[];
 const releases=[];
 const withTransaction=createPostgresTransaction({pool:{connect:async()=>({
  query:async(sql,args)=>{statements.push([sql,args]);return {rows:[]};},
  release:reason=>releases.push(reason)
 })}});
 await withTransaction(async query=>{
  for(const [sql,params] of [
   [{text:'SELECT 1'},[]],
   [null,[]],
   ['',[]],
   ['   ',[]],
   ['SELECT $1',{value:1}],
   ['SELECT $1',null],
   ['SELECT $1','one']
  ]){
   await assert.rejects(query(sql,params),/invalid_transaction_query/);
  }
  assert.deepEqual(statements.map(([sql])=>sql),['BEGIN']);
  const result=await query('SELECT $1',[1]);
  assert.deepEqual(result,{rows:[]});
 });
 assert.deepEqual(statements.map(([sql])=>sql),['BEGIN','SELECT $1','COMMIT']);
 assert.deepEqual(statements[1][1],[1]);
 assert.deepEqual(releases,[undefined]);
});

test('invalid query shape does not mask callback error or leave transaction open',async()=>{
 const statements=[],releases=[];
 const withTransaction=createPostgresTransaction({pool:{connect:async()=>({
  query:async sql=>{statements.push(sql);return {rows:[]};},
  release:reason=>releases.push(reason)
 })}});
 await assert.rejects(withTransaction(query=>query({text:'DELETE FROM sabora.orders'})),
  /invalid_transaction_query/);
 assert.deepEqual(statements,['BEGIN','ROLLBACK']);
 assert.deepEqual(releases,[undefined]);
});

test('query snapshots positional parameter array before deferred driver execution',async()=>{
 const statements=[];
 const withTransaction=createPostgresTransaction({pool:{connect:async()=>({
  query:async(sql,args)=>{statements.push([sql,args]);return {rows:[]};},
  release:()=>{}
 })}});
 await withTransaction(async query=>{
  const params=['original',42];
  const pending=query('SELECT $1, $2',params);
  params[0]='modified';
  params.push('injected');
  await pending;
 });
 assert.deepEqual(statements.map(([sql])=>sql),['BEGIN','SELECT $1, $2','COMMIT']);
 assert.deepEqual(statements[1][1],['original',42]);
});

test('transaction rejects a query after the work callback resolves',async()=>{
 let retained;
 const statements=[];
 const withTransaction=createPostgresTransaction({pool:{connect:async()=>({
  query:async sql=>{statements.push(sql);return {rows:[]};},
  release:()=>{}
 })}});
 await withTransaction(async query=>{retained=query;});
 await assert.rejects(retained('SELECT after commit'),/transaction_scope_closed/);
 assert.deepEqual(statements,['BEGIN','COMMIT']);
});
