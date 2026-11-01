// F12 isolated composition candidate. This module does not create pools, grant
// privileges, mount routes or modify the existing H6 production composition.
import {createRoleScopedPostgresTransaction} from './role-scoped-postgres.mjs';
import {assertF12SqlCapabilities} from './table-change-isolated-sql-preflight-candidate.mjs';
import {assertB3ConfirmationCapabilities} from './table-change-b3-confirmation-preflight-candidate.mjs';
import {PERSIST_H6_TRANSFER_ORDER_SQL,READ_H6_ROUND_SQL,READ_H6_PAYMENT_POLICY_SQL} from './customer-production-flow.mjs';
import {assertH6RuntimeIdentity} from './h6-sql-preflight.mjs';
import {createSealedTableChangeRpcCandidate,
 REQUEST_TABLE_CHANGE_H6_RESOLVED_SQL,DECIDE_TABLE_CHANGE_H6_SQL}
 from './table-change-sealed-rpc-candidate.mjs';

export const F12_CUSTOMER_SQL=Object.freeze([REQUEST_TABLE_CHANGE_H6_RESOLVED_SQL]);
export const F12_OPERATIONS_SQL=Object.freeze([DECIDE_TABLE_CHANGE_H6_SQL]);
export const B3_CONFIRMATION_SQL=Object.freeze([PERSIST_H6_TRANSFER_ORDER_SQL]);
export const B3_H6_READ_SQL=Object.freeze([READ_H6_ROUND_SQL,READ_H6_PAYMENT_POLICY_SQL]);

export function createIsolatedB3H6ReadTransaction({h6ReadPool}={}){
 return createRoleScopedPostgresTransaction({pool:h6ReadPool,
  role:'sabora_h6_customer_runtime',allowedSql:new Set(B3_H6_READ_SQL)});
}

// B3 is a transfer-only writer: do not pass the raw pool to a flow factory.
// Every statement must match the exact SQL string accepted by the preflight.
export function createIsolatedB3ConfirmationTransaction({confirmationPool}={}){
 return createRoleScopedPostgresTransaction({pool:confirmationPool,
  role:'sabora_b3_confirmation_runtime',allowedSql:new Set(B3_CONFIRMATION_SQL)});
}


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

// Explicit opt-in candidate factory: never expose a service until BOTH
// independent database logins pass the live least-privilege preflight.
// Does not mount HTTP routes or alter any existing production pool.
export async function createVerifiedIsolatedTableChangeSqlCandidate({
 customerPool,operationsPool,expectedCustomerLogin,expectedOperationsLogin,
 hashSession,verifyStaff
}={}){
 if(typeof hashSession!=='function'||typeof verifyStaff!=='function')
  throw Error('invalid_f12_isolated_composition');
 await assertF12SqlCapabilities({customerPool,operationsPool,
  expectedCustomerLogin,expectedOperationsLogin});
 return createIsolatedTableChangeSqlCandidate({customerPool,operationsPool,
  hashSession,verifyStaff});
}

/**
 * B3 candidate-only composition gate. It exposes the verified F12 request and
 * decision RPCs together with a caller-supplied confirmation candidate, but
 * never mounts HTTP or grants SQL privileges. All four isolated pools must
 * pass their independent preflight before a service is returned.
 */
export async function createVerifiedTableChangeB3Candidate({
 customerPool,operationsPool,confirmationPool,h6ReadPool,
 expectedCustomerLogin,expectedOperationsLogin,expectedH6ReadLogin,
 hashSession,verifyStaff,expectedConfirmationLogin,
 createConfirmationFlow
}={}){
 if(!confirmationPool||confirmationPool===customerPool||
    confirmationPool===operationsPool||
    !h6ReadPool||typeof h6ReadPool.connect!=='function'||
    [customerPool,operationsPool,confirmationPool].includes(h6ReadPool)||
    typeof confirmationPool.connect!=='function'||
    expectedConfirmationLogin===expectedCustomerLogin||
    expectedConfirmationLogin===expectedOperationsLogin||
    [expectedCustomerLogin,expectedOperationsLogin,expectedConfirmationLogin].includes(expectedH6ReadLogin)||
    typeof createConfirmationFlow!=='function')
  throw Error('invalid_b3_isolated_composition');
 const tableChange=await createVerifiedIsolatedTableChangeSqlCandidate({
  customerPool,operationsPool,expectedCustomerLogin,expectedOperationsLogin,
  hashSession,verifyStaff
 });
 // The confirmation preflight must validate the exact transfer-only EXECUTE
 // surface of its separate login. Do not substitute an H6 production preflight.
 const confirmationCheck=await assertB3ConfirmationCapabilities({
  pool:confirmationPool,expectedLogin:expectedConfirmationLogin
 });
 if(confirmationCheck?.validated!==true)
  throw Error('invalid_b3_confirmation_capabilities');
 const h6ReadCheck=await assertH6RuntimeIdentity({pool:h6ReadPool,
  expectedLogin:expectedH6ReadLogin,capability:'sabora_h6_customer_runtime'});
 if(h6ReadCheck?.validated!==true)throw Error('invalid_b3_h6_read_capabilities');
 const confirmation=await createConfirmationFlow({
  withConfirmationTransaction:createIsolatedB3ConfirmationTransaction({confirmationPool}),
  withH6ReadTransaction:createIsolatedB3H6ReadTransaction({h6ReadPool})
 });
 if(!confirmation||typeof confirmation.confirm!=='function')
  throw Error('invalid_b3_confirmation_flow');
 return Object.freeze({tableChange,confirmation});
}
