// F12 isolated composition candidate. This module does not create pools, grant
// privileges, mount routes or modify the existing H6 production composition.
import {createRoleScopedPostgresTransaction} from './role-scoped-postgres.mjs';
import {createSealedTableChangeRpcCandidate,
 REQUEST_TABLE_CHANGE_H6_RESOLVED_SQL,DECIDE_TABLE_CHANGE_H6_SQL}
 from './table-change-sealed-rpc-candidate.mjs';

export const F12_CUSTOMER_SQL=Object.freeze([REQUEST_TABLE_CHANGE_H6_RESOLVED_SQL]);
export const F12_OPERATIONS_SQL=Object.freeze([DECIDE_TABLE_CHANGE_H6_SQL]);

export function createIsolatedTableChangeSqlCandidate({
 customerPool,operationsPool,hashSession,verifyStaff
}={}){
 if(!customerPool||!operationsPool||customerPool===operationsPool||
  typeof customerPool.connect!=='function'||typeof operationsPool.connect!=='function'||
  typeof hashSession!=='function'||typeof verifyStaff!=='function')
  throw Error('invalid_f12_isolated_composition');
 // The roles intentionally do not exist in active production configuration.
 // An independently reviewed SQL migration, PG17 role preflight and approval
 // are prerequisites before these transactions can be used with real logins.
 return createSealedTableChangeRpcCandidate({
  withCustomerTransaction:createRoleScopedPostgresTransaction({
   pool:customerPool,role:'sabora_f12_customer_runtime',allowedSql:new Set(F12_CUSTOMER_SQL)
  }),
  withStaffTransaction:createRoleScopedPostgresTransaction({
   pool:operationsPool,role:'sabora_f12_operations_runtime',allowedSql:new Set(F12_OPERATIONS_SQL)
  }),
  hashSession,verifyStaff
 });
}
