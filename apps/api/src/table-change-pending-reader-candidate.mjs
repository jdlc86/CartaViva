// Candidate-only staff pending read. Never reuse the F12 decision-only role.
// No pool or route is created here; a separate login/role preflight is required.
import {createRoleScopedPostgresTransaction} from './role-scoped-postgres.mjs';
import {assertPendingReaderCapabilities,PENDING_READER_ROLE} from './table-change-pending-reader-preflight-candidate.mjs';
export const PENDING_TABLE_CHANGES_SQL=
 'SELECT request_id,source_table_number,expires_at FROM sabora.list_pending_table_changes_h6_candidate($1::uuid)';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export {PENDING_READER_ROLE};
export function createPendingTableChangeReader({withTransaction,verifyStaff}={}){
 if(typeof withTransaction!=='function'||typeof verifyStaff!=='function')
  throw Error('invalid_pending_reader_configuration');
 return Object.freeze({
  async listPending({verifiedIdentity,verifiedStaff}={}){
   if(!verifiedIdentity||!verifiedStaff)throw Error('table_change_unauthorized');
   return withTransaction(async query=>{
    const staff=await verifyStaff({query,verifiedIdentity,verifiedStaff});
    if(!staff||!UUID.test(staff.userId??'')||
     !['admin','waiter'].includes(staff.role))
     throw Error('table_change_unauthorized');
    const result=await query(PENDING_TABLE_CHANGES_SQL,[staff.userId]);
    if(!result||!Array.isArray(result.rows)||result.rows.length>100)
     throw Error('invalid_pending_projection');
    return Object.freeze(result.rows.map(row=>{
     const expiry=row?.expires_at;
     const expiresAt=expiry instanceof Date?expiry.toISOString():expiry;
     if(!UUID.test(row?.request_id??'')||
      !Number.isSafeInteger(row?.source_table_number)||row.source_table_number<1||
      typeof expiresAt!=='string'||!Number.isFinite(Date.parse(expiresAt)))
      throw Error('invalid_pending_projection');
     return Object.freeze({requestId:row.request_id,
      sourceTableNumber:row.source_table_number,expiresAt});
    }));
   });
  }
 });
}
export function createIsolatedPendingTableChangeReader({
 pendingPool,verifyStaff
}={}){
 if(!pendingPool||typeof pendingPool.connect!=='function')
  throw Error('invalid_pending_reader_configuration');
 return createPendingTableChangeReader({
  withTransaction:createRoleScopedPostgresTransaction({
   pool:pendingPool,role:PENDING_READER_ROLE,
   allowedSql:new Set([PENDING_TABLE_CHANGES_SQL])
  }),verifyStaff
 });
}

export async function createVerifiedPendingTableChangeReader({
 pendingPool,expectedLogin,verifyStaff
}={}){
 const result=await assertPendingReaderCapabilities({
  pool:pendingPool,expectedLogin
 });
 if(result.validated!==true)throw Error('invalid_pending_reader_capabilities');
 return createIsolatedPendingTableChangeReader({pendingPool,verifyStaff});
}
