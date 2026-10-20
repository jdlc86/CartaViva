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
