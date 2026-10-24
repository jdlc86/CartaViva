import test from 'node:test';
import assert from 'node:assert/strict';
import {createPostgresTransaction} from '../apps/api/src/postgres-transaction.mjs';

// An undefined binding is silently converted to SQL NULL by node-postgres.
// A missing identifier or scope must never become an authorized NULL filter.
test('transaction rejects undefined bindings without sending SQL to the driver',async()=>{
 const statements=[];
 const releases=[];
 const withTransaction=createPostgresTransaction({pool:{connect:async()=>({
  query:async(sql,args)=>{statements.push({sql,args});return {rows:[]};},
  release:reason=>releases.push(reason)
 })}});
 await withTransaction(async query=>{
  await assert.rejects(query('SELECT $1',[undefined]),/invalid_transaction_query/);
  await assert.rejects(query('SELECT $1',[1,undefined]),/invalid_transaction_query/);
  const result=await query('SELECT $1',[null]);
  assert.deepEqual(result,{rows:[]});
 });
 assert.deepEqual(statements.map(x=>x.sql),['BEGIN','SELECT $1','COMMIT']);
 assert.deepEqual(statements[1].args,[null]);
 assert.deepEqual(releases,[undefined]);
});

test('undefined binding aborts and rolls back when not handled by the caller',async()=>{
 const statements=[];
 const releases=[];
 const withTransaction=createPostgresTransaction({pool:{connect:async()=>({
  query:async sql=>{statements.push(sql);return {rows:[]};},
  release:reason=>releases.push(reason)
 })}});
 await assert.rejects(withTransaction(query=>query('INSERT INTO sabora.orders(id) VALUES ($1)',[undefined])),
  /invalid_transaction_query/);
 assert.deepEqual(statements,['BEGIN','ROLLBACK']);
 assert.deepEqual(releases,[undefined]);
});
