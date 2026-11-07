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
  async readFinancialDashboard({period='today',month=null,signal}={}){
   if(!['today','last7','thisMonth','previousMonth'].includes(period)||
       (month!==null&&(!/^20[0-9]{2}-(0[1-9]|1[0-2])$/.test(month)||period!=='thisMonth')))
    throw Error('invalid_finance_period');
   const params=new URLSearchParams({period});
   if(month!==null)params.set('month',month);
   const value=await send('/api/v1/admin/finance/dashboard?'+params,{signal});
   const integer=n=>Number.isSafeInteger(n);
   if(value.version!==1||value.status!=='ready'||typeof value.timeZone!=='string'||
      typeof value.asOf!=='string'||!Number.isFinite(Date.parse(value.asOf))||
      !['today','last7','thisMonth','previousMonth'].includes(value.period)||
      !/^20[0-9]{2}-(0[1-9]|1[0-2])$/.test(value.month??'')||
      ![value.salesCents,value.previousSalesCents,value.todaySalesCents,value.monthSalesCents,value.ordersCount,
        value.consumingAccounts,value.outstandingCents,value.cashCollectedCents].every(integer)||
      (value.collectedCents!==null&&!integer(value.collectedCents))||
      (value.todayCollectedCents!==null&&!integer(value.todayCollectedCents))||
      (value.monthCollectedCents!==null&&!integer(value.monthCollectedCents))||
      (value.stripeCollectedCents!==null&&!integer(value.stripeCollectedCents))||
      (value.previousCollectedCents!==null&&!integer(value.previousCollectedCents))||
      (value.averageTicketCents!==null&&!integer(value.averageTicketCents))||
      !['complete','incomplete'].includes(value.historicalCoverage)||
      typeof value.rankingComplete!=='boolean'||value.tipsAvailable!==false||
      !Array.isArray(value.dailySales)||value.dailySales.length>31||
      !value.dailySales.every(x=>plain(x)&&/^20[0-9]{2}-[01][0-9]-[0-3][0-9]$/.test(x.date)&&
        integer(x.netSalesCents))||
      (value.topItems!==null&&(!Array.isArray(value.topItems)||value.topItems.length>10||
       !value.topItems.every(x=>plain(x)&&typeof x.itemId==='string'&&UUID.test(x.itemId)&&
        typeof x.name==='string'&&integer(x.units)&&integer(x.netSalesCents)))))
    throw Error('m3_finance_invalid_response');
   return Object.freeze(value);
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
