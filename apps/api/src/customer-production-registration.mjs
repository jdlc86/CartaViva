import {randomUUID} from 'node:crypto';
import {prepareCustomerRegistration} from './customer-id.mjs';
import {issueCustomerSession,hashCustomerSessionToken} from './customer-session.mjs';

export const REGISTER_CUSTOMER_SQL=`SELECT profile_id,public_id,alias,company
 FROM sabora.register_customer_profile_session_candidate(
  $1::uuid,$2::text,$3::text,$4::text,$5::uuid,$6::bytea,$7::timestamptz,$8::timestamptz
 )`;

const row=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&
 (Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null);

export function createRestrictedCustomerRegistration({
 withTransaction,prepare=prepareCustomerRegistration,issue=issueCustomerSession,
 newSessionId=randomUUID,maxAttempts=5
}={}){
 if(typeof withTransaction!=='function'||typeof prepare!=='function'||
    typeof issue!=='function'||typeof newSessionId!=='function'||
    !Number.isSafeInteger(maxAttempts)||maxAttempts<1||maxAttempts>20)
  throw Error('invalid_restricted_customer_registration');
 return async function register(input){
  for(let attempt=0;attempt<maxAttempts;attempt++){
   const candidate=prepare(input);
   if(candidate?.error)return candidate;
   const session=issue();
   const sessionId=newSessionId();
   if(!candidate||typeof candidate.internalId!=='string'||
      typeof candidate.publicId!=='string'||typeof candidate.alias!=='string'||
      !session||typeof session.token!=='string'||
      !Buffer.isBuffer(session.tokenHash)||session.tokenHash.length!==32||
      !hashCustomerSessionToken(session.token)?.equals(session.tokenHash)||
      !(session.createdAt instanceof Date)||!(session.expiresAt instanceof Date)||
      !Number.isFinite(session.createdAt.getTime())||
      !Number.isFinite(session.expiresAt.getTime())||
      typeof sessionId!=='string')
    throw Error('invalid_restricted_customer_registration');
   try{
    const result=await withTransaction(query=>query(REGISTER_CUSTOMER_SQL,[
     candidate.internalId,candidate.publicId,candidate.alias,candidate.company,
     sessionId,session.tokenHash,session.createdAt,session.expiresAt
    ]));
    if(!result||!Array.isArray(result.rows)||result.rows.length!==1||
       !row(result.rows[0])||result.rows[0].profile_id!==candidate.internalId||
       result.rows[0].public_id!==candidate.publicId||
       result.rows[0].alias!==candidate.alias||
       (result.rows[0].company??null)!==(candidate.company??null))
      throw Error('invalid_customer_registration_result');
    return Object.freeze({
     profile:Object.freeze({id:result.rows[0].profile_id,
      public_id:result.rows[0].public_id,alias:result.rows[0].alias,
      company:result.rows[0].company??null}),
     token:session.token,expiresAt:session.expiresAt
    });
   }catch(error){
    if(error?.code!=='23505'||error?.constraint!=='customer_profiles_public_id_key')
     throw error;
    if(attempt===maxAttempts-1)throw Error('customer_public_id_collision_limit');
   }
  }
  throw Error('customer_public_id_collision_limit');
 };
}
