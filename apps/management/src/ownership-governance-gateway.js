import {createStaffGatewayAuth} from './staff-gateway-auth.js';

// PWA-management-only ownership gateway.
// never persist authority, tokens, governance receipts or stale projections.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACTIONS=new Set(['request','offer','accept','reject','cancel','force']);
export class OwnershipGovernanceGatewayError extends Error {
 constructor(code,status){super(code);this.name='OwnershipGovernanceGatewayError';
  this.code=code;this.status=status;}
}
export function createAuthenticatedOwnershipGovernanceGateway({getAccessToken,cookieSession,
 fetchImpl=fetch}={}){
 if(typeof fetchImpl!=='function')
  throw Error('invalid_ownership_gateway');
 const auth=createStaffGatewayAuth({getAccessToken,cookieSession},{
  invalid:'invalid_ownership_gateway',minimum:20,
  unavailable:()=>new OwnershipGovernanceGatewayError('session_unavailable',403)
 });
 let epoch=0,revoked=false;
 const controller=new AbortController();
 const send=async(method,url,body)=>{
  if(revoked)throw new OwnershipGovernanceGatewayError('session_revoked',403);
  const generation=epoch;
  const headers=await auth.headers(body?{'content-type':'application/json'}:{});
  if(revoked||generation!==epoch)throw new OwnershipGovernanceGatewayError('session_revoked',403);
  const response=await fetchImpl(url,{method,headers,redirect:'error',
   ...(body?{body:JSON.stringify(body)}:{}),cache:'no-store',credentials:auth.credentials,signal:controller.signal});
  if(revoked||generation!==epoch)throw new OwnershipGovernanceGatewayError('session_revoked',403);
  let data;
  try{data=await response.json();}catch{
   if(revoked||generation!==epoch)
    throw new OwnershipGovernanceGatewayError('session_revoked',403);
   throw new OwnershipGovernanceGatewayError('unavailable',503);
  }
  // A transport may finish decoding a buffered body after AbortController
  // fires. Never deliver that previous employee's projection or result.
  if(revoked||generation!==epoch)
   throw new OwnershipGovernanceGatewayError('session_revoked',403);
  if(!response.ok){
   const code=['forbidden','ownership_conflict','invalid_ownership_request','ownership_unavailable']
    .includes(data?.error)?data.error:'unavailable';
   throw new OwnershipGovernanceGatewayError(code,response.status);
  }
  if(!data||typeof data!=='object'||Array.isArray(data))
   throw new OwnershipGovernanceGatewayError('invalid_response',503);
  return data;
 };
 return Object.freeze({
  read:()=>send('GET','/api/v1/admin/ownership'),
  transition({action,proposalId=null,targetUserId=null,reason=null,requestId=crypto.randomUUID()}={}){
   if(!ACTIONS.has(action)||!UUID.test(requestId)|| 
     (proposalId!==null&&!UUID.test(proposalId))||
     (targetUserId!==null&&!UUID.test(targetUserId))||
     (reason!==null&&typeof reason!=='string'))
    throw Error('invalid_ownership_request');
   return send('POST','/api/v1/admin/ownership/actions',{
    requestId,action,proposalId,targetUserId,reason});
  },
  revoke(){if(!revoked){revoked=true;epoch++;controller.abort();}}
 });
}
