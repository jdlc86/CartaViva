const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&
 (Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null);

export function createM3AuthenticatedManagementGateway({getAccessToken,fetchImpl=globalThis.fetch}={}){
 if(typeof getAccessToken!=='function'||typeof fetchImpl!=='function')
  throw Error('invalid_m3_management_auth_transport');
 const controller=new AbortController();
 const send=async(path,{method='GET',body,signal}={})=>{
  if(controller.signal.aborted||typeof path!=='string'||!path.startsWith('/api/v1/admin/')||
     path.startsWith('//')||path.includes('\\')||/[\r\n]/.test(path))
   throw Error('m3_management_auth_unavailable');
  const token=await getAccessToken();
  if(typeof token!=='string'||token.length<16||token.length>16384||/[^A-Za-z0-9._~-]/.test(token))
   throw Error('m3_management_auth_unavailable');
  const requestController=new AbortController();
  const abort=()=>requestController.abort();
  controller.signal.addEventListener('abort',abort,{once:true});
  signal?.addEventListener('abort',abort,{once:true});
  if(controller.signal.aborted||signal?.aborted)abort();
  try{
   const response=await fetchImpl(path,{method,credentials:'omit',redirect:'error',cache:'no-store',
    headers:{Authorization:`Bearer ${token}`,...(body===undefined?{}:{'Content-Type':'application/json'})},
    ...(body===undefined?{}:{body:JSON.stringify(body)}),signal:requestController.signal});
   const value=await response.json().catch(()=>null);
   if(!response.ok||!plain(value))throw Error(response.status===409?'m3_management_conflict':
    response.status===403?'m3_management_forbidden':'m3_management_unavailable');
   return value;
  }finally{
   controller.signal.removeEventListener('abort',abort);signal?.removeEventListener('abort',abort);
  }
 };
 return Object.freeze({
  listTables({afterNumber=0,limit=24,signal}={}){
   if(!Number.isSafeInteger(afterNumber)||afterNumber<0||!Number.isSafeInteger(limit)||limit<1||limit>100)
    throw Error('invalid_admin_tables_page_request');
   return send(`/api/v1/admin/tables?afterNumber=${afterNumber}&limit=${limit}`,{signal});
  },
  manageTable({requestId,operation,payload,signal}={}){
   if(!UUID.test(requestId??'')||typeof operation!=='string'||!plain(payload))
    throw Error('invalid_m3_table_request');
   return send('/api/v1/admin/tables/actions',{method:'POST',body:{requestId,operation,payload},signal});
  },
  transitionOccupancy({requestId,tableId,target,pauseUntil=null,signal}={}){
   if(!UUID.test(requestId??'')||!UUID.test(tableId??''))throw Error('invalid_m3_table_request');
   return send(`/api/v1/admin/tables/${tableId}/occupancy`,{method:'POST',
    body:{requestId,target,pauseUntil},signal});
  },
  readManagementCatalog({signal}={}){return send('/api/v1/admin/catalog',{signal});},
  manageCatalog({requestId,operation,payload,signal}={}){
   if(!UUID.test(requestId??'')||typeof operation!=='string'||!plain(payload))
    throw Error('invalid_m3_catalog_request');
   return send('/api/v1/admin/catalog/actions',{method:'POST',
    body:{requestId,operation,payload},signal});
  },
  revoke(){controller.abort();}
 });
}
