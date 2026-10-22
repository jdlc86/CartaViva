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
    started();
    await new Promise(resolve=>{resolveQuery=resolve;});
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
 await Promise.resolve();
 assert.equal(statements.includes('COMMIT'),false);
 resolveQuery();
 await assert.rejects(pending,/transaction_queries_not_awaited/);
 assert.deepEqual(statements,['BEGIN','SELECT slow','ROLLBACK']);
 assert.equal(releases.length,1);
 assert.match(releases[0]?.message??'',/transaction_queries_not_awaited/);
});
