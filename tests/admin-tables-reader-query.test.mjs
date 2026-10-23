import test from 'node:test';
import assert from 'node:assert/strict';
import {ADMIN_TABLES_SQL,createAdminTablesReaderQuery} from '../apps/api/src/admin-tables-reader-query.mjs';
test('administrative SQL reader permits only the exact bounded statement',async()=>{
 const seen=[];
 const query=createAdminTablesReaderQuery({pool:{query:async(...args)=>{
  seen.push(args);return {rows:[]};
 }}});
 assert.deepEqual(await query(ADMIN_TABLES_SQL,[0,51]),{rows:[]});
 assert.deepEqual(seen,[[ADMIN_TABLES_SQL,[0,51]]]);
 for(const [sql,params] of [
  ['SELECT * FROM sabora.dining_tables',[0,51]],
  [ADMIN_TABLES_SQL+'; SELECT 1',[0,51]],
  [ADMIN_TABLES_SQL,[0,102]],
  [ADMIN_TABLES_SQL,[-1,51]],
  [ADMIN_TABLES_SQL,[0,1]],
  [ADMIN_TABLES_SQL,['0',51]],
  [ADMIN_TABLES_SQL,[0,51,99]]
 ])await assert.rejects(query(sql,params),/admin_tables_query_not_allowed/);
 assert.equal(seen.length,1);
});
