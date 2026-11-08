// PWA-management-only ownership gateway. A JWT is fetched for each operation;
// never persist authority, tokens, governance receipts or stale projections.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACTIONS=new Set(['request','offer','accept','reject','cancel','force']);
export class OwnershipGovernanceGatewayError extends Error {
 constructor(code,status){super(code);this.name='OwnershipGovernanceGatewayError';
  this.code=code;this.status=status;}
}
export function createAuthenticatedOwnershipGovernanceGateway({getAccessToken,
 fetchImpl=fetch}={}){
 if(typeof getAccessToken!=='function'||typeof fetchImpl!=='function')
  throw Error('invalid_ownership_gateway');
 let epoch=0,revoked=false;
 const send=async(method,url,body)=>{
  if(revoked)throw new OwnershipGovernanceGatewayError('session_revoked',403);
  const generation=epoch;
  const token=await getAccessToken();
  if(revoked||generation!==epoch)throw new OwnershipGovernanceGatewayError('session_revoked',403);
  if(typeof token!=='string'||token.length<20)
   throw new OwnershipGovernanceGatewayError('session_unavailable',403);
  const response=await fetchImpl(url,{method,headers:{
   authorization:'Bearer '+token,...(body?{'content-type':'application/json'}:{})},
   ...(body?{body:JSON.stringify(body)}:{}),cache:'no-store'});
  if(revoked||generation!==epoch)throw new OwnershipGovernanceGatewayError('session_revoked',403);
  let data;
  try{data=await response.json();}catch{throw new OwnershipGovernanceGatewayError('unavailable',503);}
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
  revoke(){revoked=true;epoch++;}
 });
}
