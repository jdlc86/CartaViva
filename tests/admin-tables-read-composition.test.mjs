import test from 'node:test';
import assert from 'node:assert/strict';
import {registerProtectedAdminTablesReadFromPools} from '../apps/api/src/admin-tables-read-composition.mjs';
test('administrative read composition refuses a shared privileged pool',()=>{
 const pool={query:async()=>({rows:[]})};
 assert.throws(()=>registerProtectedAdminTablesReadFromPools(
  {get(){throw Error('must not register');}},
  {staffPool:pool,adminTablesPool:pool}
 ),/invalid_admin_tables_pool_isolation/);
});
test('administrative read composition wires a route with separate pools only',()=>{
 const registered=[];
 const staffPool={query:async()=>({rows:[]})};
 const adminTablesPool={query:async()=>({rows:[]})};
 registerProtectedAdminTablesReadFromPools({get:(...args)=>registered.push(args)},{
  staffPool,adminTablesPool,
  issuer:'https://example.invalid/auth/v1',
  getTrustedKeys:async()=>[],
  verify:async()=>({sub:'00000000-0000-4000-8000-000000000001'})
 });
 assert.equal(registered.length,1);
 assert.equal(registered[0][0],'/api/v1/admin/tables');
 assert.equal(registered[0][1].preHandler.length,2);
 assert.equal(typeof registered[0][2],'function');
});
