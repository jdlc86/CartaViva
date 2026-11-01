// F12 isolated composition candidate. This module does not create pools, grant
// privileges, mount routes or modify the existing H6 production composition.
import {createRoleScopedPostgresTransaction} from './role-scoped-postgres.mjs';
import {assertF12SqlCapabilities} from './table-change-isolated-sql-preflight-candidate.mjs';
import {assertB3ConfirmationCapabilities} from './table-change-b3-confirmation-preflight-candidate.mjs';
import {createCustomerProductionFlow,PERSIST_H6_TRANSFER_ORDER_SQL,READ_H6_ROUND_SQL,READ_H6_PAYMENT_POLICY_SQL} from './customer-production-flow.mjs';
import {assertCustomerFlowSqlCapabilities} from './customer-production-sql-preflight.mjs';
import {AUTHORIZE_VISIT_SQL,PREPARE_QUOTE_SQL,INSERT_QUOTE_SQL,
 LOOKUP_ATTEMPT_SQL,PREPARE_CONFIRMATION_SQL,PERSIST_ORDER_SQL}
 from './customer-production-flow.mjs';
import {createSealedTableChangeRpcCandidate,
 REQUEST_TABLE_CHANGE_H6_RESOLVED_SQL,DECIDE_TABLE_CHANGE_H6_SQL}
 from './table-change-sealed-rpc-candidate.mjs';

export const F12_CUSTOMER_SQL=Object.freeze([REQUEST_TABLE_CHANGE_H6_RESOLVED_SQL]);
export const F12_OPERATIONS_SQL=Object.freeze([DECIDE_TABLE_CHANGE_H6_SQL]);
// B3 uses a dedicated reader role, never the H6 customer runtime writer.
// The login has exactly one SET ROLE membership and no direct Sabora EXECUTE.
export const B3_H6_READER_ROLE='sabora_b3_h6_reader_runtime';
export const B3_H6_READER_SIGNATURES=Object.freeze([
 'sabora.read_customer_round_h6_candidate(bytea,uuid,text,uuid)',
 'sabora.read_customer_payment_policy_h6_candidate(bytea,uuid,text)'
]);
export const B3_H6_LOGIN_SURFACE_SQL=`SELECT
 current_user AS effective_role,session_user AS login_role,
 r.rolcanlogin AS can_login,r.rolinherit AS inherit_role,
 r.rolsuper AS superuser,r.rolbypassrls AS bypass_rls,
 r.rolcreatedb AS create_db,r.rolcreaterole AS create_role,
 r.rolreplication AS replication,
 has_database_privilege(current_user,current_database(),'CREATE') AS database_create,
 has_schema_privilege(current_user,'sabora','CREATE') AS schema_create,
 (SELECT coalesce(array_agg(other.rolname::text ORDER BY other.rolname::text),'{}'::text[])
  FROM pg_roles other WHERE other.rolname<>current_user AND
   pg_has_role(current_user,other.oid,'SET')) AS set_roles,
 (SELECT coalesce(array_agg(n.nspname||'.'||p.proname||'('||replace(oidvectortypes(p.proargtypes),', ',',')||')' ORDER BY p.oid),
  '{}'::text[]) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='sabora' AND
   has_function_privilege(current_user,p.oid,'EXECUTE')) AS executable_functions,
 EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='sabora' AND c.relkind IN ('r','p') AND
   has_table_privilege(current_user,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')) AS direct_relations,
 EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='sabora' AND c.relkind='S' AND
   has_sequence_privilege(current_user,c.oid,'USAGE,SELECT,UPDATE')) AS direct_sequences
 FROM pg_roles r WHERE r.rolname=current_user`;
export const B3_H6_READER_FUNCTION_SQL=`SELECT coalesce(array_agg(p.oid::regprocedure::text ORDER BY p.oid::regprocedure::text),
 '{}'::text[]) AS signatures FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='sabora' AND has_function_privilege($1::name,p.oid,'EXECUTE')`;
export async function assertB3H6LoginSurface({pool,expectedLogin}={}){
 if(!pool||typeof pool.connect!=='function'||
    typeof expectedLogin!=='string'||!/^[a-z][a-z0-9_]{0,62}$/.test(expectedLogin)||
    expectedLogin===B3_H6_READER_ROLE)throw Error('invalid_b3_h6_login_surface');
 let client,valid=false;
 try{
  client=await pool.connect();
  const result=await client.query(B3_H6_LOGIN_SURFACE_SQL);
  const row=result?.rows?.length===1?result.rows[0]:null;
  if(!row||row.effective_role!==expectedLogin||row.login_role!==expectedLogin||
     row.can_login!==true||row.inherit_role!==false||row.superuser!==false||
     row.bypass_rls!==false||row.create_db!==false||row.create_role!==false||
     row.replication!==false||row.database_create!==false||row.schema_create!==false||
     row.direct_relations!==false||row.direct_sequences!==false||
     !Array.isArray(row.set_roles)||row.set_roles.length!==1||
     row.set_roles[0]!==B3_H6_READER_ROLE||
     !Array.isArray(row.executable_functions)||row.executable_functions.length!==0)
   throw Error('invalid_b3_h6_login_surface');
  const functions=await client.query(B3_H6_READER_FUNCTION_SQL,[B3_H6_READER_ROLE]);
  const signatures=functions?.rows?.length===1?functions.rows[0].signatures:null;
  if(!Array.isArray(signatures)||signatures.length!==2||
     !B3_H6_READER_SIGNATURES.every(name=>signatures.includes(name)))
   throw Error('invalid_b3_h6_reader_function_surface');
  valid=true;
  return Object.freeze({validated:true});
 }catch{throw Error('invalid_b3_h6_reader_capabilities');}
 finally{if(client)try{client.release(!valid);}catch{}}
}

export const B3_CONFIRMATION_SQL=Object.freeze([PERSIST_H6_TRANSFER_ORDER_SQL]);
export const B3_H6_READ_SQL=Object.freeze([READ_H6_ROUND_SQL,READ_H6_PAYMENT_POLICY_SQL]);

export function createIsolatedB3H6ReadTransaction({h6ReadPool}={}){
 return createRoleScopedPostgresTransaction({pool:h6ReadPool,
  role:B3_H6_READER_ROLE,allowedSql:new Set(B3_H6_READ_SQL)});
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
 await assertB3H6LoginSurface({pool:h6ReadPool,expectedLogin:expectedH6ReadLogin});
 const confirmation=await createConfirmationFlow({
  withConfirmationTransaction:createIsolatedB3ConfirmationTransaction({confirmationPool}),
  withH6ReadTransaction:createIsolatedB3H6ReadTransaction({h6ReadPool})
 });
 if(!confirmation||typeof confirmation.confirm!=='function')
  throw Error('invalid_b3_confirmation_flow');
 return Object.freeze({tableChange,confirmation});
}


/**
 * Candidate-only adapter to the real customer confirmation flow. The ordinary
 * customer basket/quote SQL remains on its separately supplied transaction;
 * B3 can only persist the transfer, while H6 can only read policy/replay.
 * Call only after all five SQL identities pass the verified factory preflight.
 * No routes, connections or database privileges are created here.
 */
export function createB3CustomerConfirmationFlowCandidate({
 withCustomerTransaction,secretKey,clock,newId
}={}){
 if(typeof withCustomerTransaction!=='function'||
    typeof secretKey!=='string'||Buffer.byteLength(secretKey,'utf8')<32)
  throw Error('invalid_b3_customer_confirmation_adapter');
 return ({withConfirmationTransaction,withH6ReadTransaction}={})=>{
  if(typeof withConfirmationTransaction!=='function'||
     typeof withH6ReadTransaction!=='function')
   throw Error('invalid_b3_customer_confirmation_adapter');
  const flow=createCustomerProductionFlow({
   withTransaction:withCustomerTransaction,secretKey,
   ...(clock===undefined?{}:{clock}),...(newId===undefined?{}:{newId}),
   withH6Transaction:withConfirmationTransaction,
   withH6ReadTransaction,h6ConfirmationSql:PERSIST_H6_TRANSFER_ORDER_SQL
  });
  return Object.freeze({confirm:flow.confirm});
 };
}


// A separate B3 guard closes a gap in the shared customer preflight: its
// three-role SET checks alone do not exclude membership in a fourth role.
export const B3_CUSTOMER_FLOW_EXACT_SET_SQL=`SELECT coalesce(array_agg(r.rolname::text ORDER BY r.rolname::text),
 '{}'::text[]) AS roles FROM pg_roles r
 WHERE r.rolname<>current_user AND pg_has_role(current_user,r.oid,'SET')`;

export async function assertB3CustomerFlowExactSetRole({pool}={}){
 if(!pool||typeof pool.connect!=='function')
  throw Error('invalid_b3_customer_flow_set_roles');
 let client,valid=false;
 try{
  client=await pool.connect();
  const result=await client.query(B3_CUSTOMER_FLOW_EXACT_SET_SQL);
  const roles=result?.rows?.length===1?result.rows[0].roles:null;
  if(!Array.isArray(roles)||roles.length!==1||roles[0]!=='sabora_customer_flow_runtime')
   throw Error('invalid_b3_customer_flow_set_roles');
  valid=true;
  return Object.freeze({validated:true});
 }catch(error){
  throw Error('invalid_b3_customer_flow_set_roles');
 }finally{if(client)try{client.release(!valid);}catch{}}
}

export const B3_CUSTOMER_FLOW_SQL=Object.freeze([
 AUTHORIZE_VISIT_SQL,PREPARE_QUOTE_SQL,INSERT_QUOTE_SQL,
 LOOKUP_ATTEMPT_SQL,PREPARE_CONFIRMATION_SQL,PERSIST_ORDER_SQL
]);

/**
 * Five-identity, opt-in candidate. Validate the basket/quote login using the
 * existing exact customer-flow PG capability preflight, and independently
 * validate F12 customer/operations, B3 writer and H6 reader. Nothing mounts.
 */
export async function createVerifiedTableChangeB3CustomerFlowCandidate({
 customerPool,operationsPool,confirmationPool,h6ReadPool,flowPool,
 expectedCustomerLogin,expectedOperationsLogin,expectedConfirmationLogin,
 expectedH6ReadLogin,expectedFlowLogin,hashSession,verifyStaff,
 secretKey,clock,newId
}={}){
 const pools=[customerPool,operationsPool,confirmationPool,h6ReadPool,flowPool];
 const logins=[expectedCustomerLogin,expectedOperationsLogin,expectedConfirmationLogin,
  expectedH6ReadLogin,expectedFlowLogin];
 if(pools.some(pool=>!pool||typeof pool.connect!=='function')||
    new Set(pools).size!==5||new Set(logins).size!==5||
    logins.some(login=>typeof login!=='string'||login.length===0))
  throw Error('invalid_b3_customer_flow_isolation');
 // Reject malformed application configuration before touching any SQL pool.
 // The actual role-capability preflights still run before constructing the flow.
 if(typeof secretKey!=='string'||Buffer.byteLength(secretKey,'utf8')<32||
    (clock!==undefined&&typeof clock!=='function')||
    (newId!==undefined&&typeof newId!=='function')||
    typeof hashSession!=='function'||typeof verifyStaff!=='function')
  throw Error('invalid_b3_customer_flow_configuration');
 await assertCustomerFlowSqlCapabilities({pool:flowPool,expectedLogin:expectedFlowLogin});
 await assertB3CustomerFlowExactSetRole({pool:flowPool});
 const withCustomerTransaction=createRoleScopedPostgresTransaction({
  pool:flowPool,role:'sabora_customer_flow_runtime',
  allowedSql:new Set(B3_CUSTOMER_FLOW_SQL)
 });
 return createVerifiedTableChangeB3Candidate({
  customerPool,operationsPool,confirmationPool,h6ReadPool,
  expectedCustomerLogin,expectedOperationsLogin,expectedConfirmationLogin,
  expectedH6ReadLogin,hashSession,verifyStaff,
  createConfirmationFlow:createB3CustomerConfirmationFlowCandidate({
   withCustomerTransaction,secretKey,clock,newId
  })
 });
}
