import {createHash,createHmac} from 'node:crypto';
import {hashRootCredentialId} from './staff-root-credential-id.mjs';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LOGIN=/^[a-z][a-z0-9_]{0,62}$/;
export const ROOT_BOOTSTRAP_SQL='SELECT sabora.consume_root_bootstrap_candidate($1::uuid,$2::uuid,$3::uuid,$4::text,$5::bigint,$6::bigint,$7::text,$8::text) AS consumed';

// Candidate-only. The caller must be the fresh, verified passkey ceremony
// handler, not a JSON actor identity or a general authenticated session.
export function createStaffRootBootstrapCandidate({pool,databaseRole,now=Date.now}={}){
 if(!pool||typeof pool.query!=='function'||!LOGIN.test(databaseRole??'')||typeof now!=='function')
  throw Error('invalid_root_bootstrap_config');
 return async function bootstrap({identity,grantId,authorizationCode,credentialId}={}){
  if(!UUID.test(identity?.userId??'')||!UUID.test(identity?.sessionId??'')||
     !Number.isSafeInteger(identity.expiresAt)||!UUID.test(grantId??'')||
     typeof authorizationCode!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(authorizationCode)||
     Buffer.from(authorizationCode,'base64url').toString('base64url')!==authorizationCode)
   throw Error('invalid_root_bootstrap_request');
  const issued=now(),expires=Math.min(issued+30_000,identity.expiresAt*1000);
  if(!Number.isSafeInteger(issued)||!Number.isSafeInteger(expires)||expires<=issued)
   throw Error('invalid_root_bootstrap_request');
  const userId=identity.userId.toLowerCase(),sessionId=identity.sessionId.toLowerCase();
  const id=grantId.toLowerCase(),credentialHash=hashRootCredentialId(credentialId);
  const verifier=createHash('sha256').update(authorizationCode,'utf8').digest();
  const proof=createHmac('sha256',verifier).update([
   'sabora.root-bootstrap.v2',databaseRole,id,userId,sessionId,String(issued),String(expires),credentialHash
  ].join('\n')).digest('hex');
  verifier.fill(0);
  const result=await pool.query(ROOT_BOOTSTRAP_SQL,[id,userId,sessionId,databaseRole,issued,expires,credentialHash,proof]);
  if(result?.rows?.length!==1||result.rows[0]?.consumed!==true)
   throw Error('root_bootstrap_unavailable');
  return true;
 };
}
